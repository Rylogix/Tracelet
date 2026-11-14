import ipaddress
import json
import time
from urllib.parse import quote

from .db import connect
from .providers import request, finding


async def dns_lookup(name, kind):
    key = name.lower() + ":" + kind
    with connect() as db:
        cached = db.execute(
            "SELECT payload FROM provider_cache WHERE provider='dns' AND query=? AND expires>?",
            (key, time.time()),
        ).fetchone()
    if cached:
        return json.loads(cached[0])
    data = await request(
        "dns",
        "https://dns.google/resolve?name=" + quote(name, safe="") + "&type=" + kind,
        timeout=3,
    )
    if data.get("Status") not in (0, 3):
        raise ValueError("Public DNS resolver could not answer this query.")
    answers = data.get("Answer", [])
    negative = [
        min(int(a.get("TTL", 0)), int(str(a.get("data", "0")).split()[-1]))
        for a in data.get("Authority", [])
        if a.get("type") == 6
    ]
    ttl = min(
        [300] + ([int(a.get("TTL", 0)) for a in answers] if answers else negative)
    )
    if ttl > 0 and (answers or negative):
        with connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO provider_cache VALUES('dns',?,?,?)",
                (key, json.dumps(data), time.time() + ttl),
            )
    return data


def txt(data):
    import re

    return [
        re.sub(r'"\s*"', "", str(a["data"])).strip('"')
        for a in data.get("Answer", [])
        if a.get("type") == 16
    ]


def rdap_summary(data):
    events = {e.get("eventAction"): e.get("eventDate") for e in data.get("events", [])}
    result = {
        "domain": data.get("ldhName") or data.get("unicodeName"),
        "status": data.get("status", []),
        "nameservers": [
            n.get("ldhName") or n.get("unicodeName")
            for n in data.get("nameservers", [])
        ],
    }
    for key, event in [
        ("registered", "registration"),
        ("expires", "expiration"),
        ("last_changed", "last changed"),
    ]:
        if events.get(event):
            result[key] = events[event]
    registrar = next(
        (e for e in data.get("entities", []) if "registrar" in e.get("roles", [])), {}
    )
    cards = registrar.get("vcardArray", [None, []])[1]
    organization = next(
        (c[3] for c in cards if c[0] in ("fn", "org") and isinstance(c[3], str)), None
    )
    if organization:
        result["registrar"] = organization
    identifier = next(
        (
            v.get("identifier")
            for v in registrar.get("publicIds", [])
            if v.get("type") == "IANA Registrar ID"
        ),
        None,
    )
    if identifier:
        result["registrar_iana_id"] = identifier
    signed = data.get("secureDNS", {}).get("delegationSigned")
    if isinstance(signed, bool):
        result["dnssec_delegation_signed"] = signed
    return result


async def domain_adapter(provider, target, kind, emit=None):
    results = []

    async def publish(value):
        results.append(value)
        if emit:
            await emit(value)

    def url(name, record):
        return (
            "https://dns.google/query?name=" + quote(name, safe="") + "&type=" + record
        )

    if provider == "dns":
        types = (
            ["MX", "TXT", "A", "AAAA"]
            if kind == "email"
            else ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "CAA", "SOA"]
        )
        for record in types:
            data = await dns_lookup(target, record)
            value = {
                "answers": [
                    {
                        "value": a["data"],
                        "type": a.get("type"),
                        "ttl_seconds": a.get("TTL"),
                    }
                    for a in data.get("Answer", [])
                ]
            }
            if isinstance(data.get("AD"), bool):
                value["dnssec_validated"] = data["AD"]
            if data["Status"] == 3:
                value["response"] = "NXDOMAIN"
            await publish(
                finding(
                    "Google Public DNS", record + " records", value, url(target, record)
                )
            )
    if provider == "email-security":
        mx, root = await dns_lookup(target, "MX"), await dns_lookup(target, "TXT")
        dmarc = await dns_lookup("_dmarc." + target, "TXT")
        spf = [v for v in txt(root) if v.lower().startswith("v=spf1")]
        records = [v for v in txt(dmarc) if v.lower().startswith("v=dmarc1")]
        value = {
            "domain": target,
            "mx_records": [
                a["data"] for a in mx.get("Answer", []) if a.get("type") == 15
            ],
            "spf_records": spf,
            "dmarc_records": records,
            "note": "Public domain configuration only. Does not prove mailbox existence, deliverability or account ownership.",
        }
        if len(records) == 1:
            policy = dict(
                p.strip().split("=", 1) for p in records[0].split(";") if "=" in p
            )
            for label, key in [
                ("dmarc_policy", "p"),
                ("subdomain_policy", "sp"),
                ("policy_percentage", "pct"),
                ("dkim_alignment", "adkim"),
                ("spf_alignment", "aspf"),
            ]:
                if key in policy:
                    value[label] = policy[key]
        if len(spf) > 1:
            value["spf_issue"] = "Multiple SPF records returned"
        if len(records) > 1:
            value["dmarc_issue"] = "Multiple DMARC records returned"
        await publish(
            finding("Email DNS", "SPF & DMARC", value, url("_dmarc." + target, "TXT"))
        )
        sts, tls = (
            await dns_lookup("_mta-sts." + target, "TXT"),
            await dns_lookup("_smtp._tls." + target, "TXT"),
        )
        await publish(
            finding(
                "Email DNS",
                "Mail transport policies",
                {
                    "domain": target,
                    "mta_sts_records": txt(sts),
                    "tls_reporting_records": txt(tls),
                },
                url("_mta-sts." + target, "TXT"),
            )
        )
    if provider == "network":
        dns = await dns_lookup(target, "A")
        addresses = []
        for answer in dns.get("Answer", []):
            if answer.get("type") == 1:
                try:
                    if ipaddress.IPv4Address(answer["data"]).is_global:
                        addresses.append(answer["data"])
                except ValueError:
                    pass
        if not addresses:
            raise ValueError("No public IPv4 address was returned for network lookup.")
        ip = addresses[0]
        name = ".".join(reversed(ip.split("."))) + ".origin.asn.cymru.com"
        routes = []
        import re

        for record in txt(await dns_lookup(name, "TXT")):
            parts = [part.strip() for part in record.split("|")]
            if len(parts) >= 5 and re.fullmatch(r"[0-9 ]+", parts[0]):
                routes.append(
                    dict(
                        zip(
                            (
                                "asn",
                                "prefix",
                                "allocation_country",
                                "registry",
                                "allocated",
                            ),
                            parts,
                        )
                    )
                )
        if not routes:
            raise ValueError("No public ASN mapping was returned.")
        value = {
            "ip": ip,
            "routes": routes,
            "note": "Routing registration for a resolved IP, not proof of the website owner's identity or physical location.",
        }
        try:
            records = txt(
                await dns_lookup(
                    "AS" + routes[0]["asn"].split()[0] + ".asn.cymru.com", "TXT"
                )
            )
            if records and len(records[0].split("|")) >= 5:
                value["network_name"] = records[0].split("|")[4].strip()
        except ValueError:
            value["network_name_lookup"] = "Unavailable"
        await publish(
            finding("Team Cymru DNS", "Public network", value, url(name, "TXT"))
        )
    return results
