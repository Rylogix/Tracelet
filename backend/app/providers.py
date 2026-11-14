import asyncio
import time
from datetime import datetime, timezone
from urllib.parse import quote
import httpx
from .db import connect, credential

LOCKS = {}
LAST = {}


def now():
    return datetime.now(timezone.utc).isoformat()


async def request(provider, url, headers=None):
    """Serialize per provider; atomically reserve local budget before transmission."""
    lock = LOCKS.setdefault(provider, asyncio.Lock())
    async with lock:
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("INSERT OR IGNORE INTO usage(provider) VALUES(?)", (provider,))
            row = db.execute(
                "SELECT * FROM usage WHERE provider=?", (provider,)
            ).fetchone()
            if row["blocked_until"] > time.time():
                raise ValueError("Provider is cooling down after rate limiting.")
            if row["remaining"] is not None and row["remaining"] <= 0:
                raise ValueError(
                    "Provider-confirmed allowance exhausted; refresh provider quota before retrying."
                )
            if row["budget"] is not None and row["attempts"] >= row["budget"]:
                raise ValueError("Personal local request budget reached.")
            db.execute(
                "UPDATE usage SET attempts=attempts+1, last_update=? WHERE provider=?",
                (now(), provider),
            )
        interval = 15 if provider == "virustotal" else 6 if provider == "rdap" else 2
        await asyncio.sleep(
            max(0, interval - (time.monotonic() - LAST.get(provider, 0)))
        )
        LAST[provider] = time.monotonic()
        try:
            async with httpx.AsyncClient(
                timeout=20, follow_redirects=False, trust_env=True
            ) as client:
                response = await client.get(
                    url, headers=headers or {}, follow_redirects=False
                )
                # Only RDAP's trusted bootstrap may redirect, and only to public HTTPS endpoints.
                if provider == "rdap":
                    from .security import public_domain

                    for _ in range(3):
                        if response.status_code not in (301, 302, 303, 307, 308):
                            break
                        location = str(response.url.join(response.headers["location"]))
                        if not location.startswith("https://"):
                            raise ValueError("Insecure RDAP redirect refused.")
                        await asyncio.to_thread(public_domain, location)
                        response = await client.get(location)
            success = response.is_success
            quota = {}
            for field, names in [
                ("quota_limit", ["x-ratelimit-limit", "ratelimit-limit"]),
                ("remaining", ["x-ratelimit-remaining", "ratelimit-remaining"]),
            ]:
                for name in names:
                    raw = response.headers.get(name)
                    if raw and raw.isdigit():
                        quota[field] = float(raw)
                        break
            reset = response.headers.get("x-ratelimit-reset")
            if reset and reset.isdigit():
                quota["reset"] = datetime.fromtimestamp(
                    int(reset), timezone.utc
                ).isoformat()
            with connect() as db:
                db.execute(
                    "UPDATE usage SET successes=successes+?, failures=failures+?, last_success=CASE WHEN ? THEN ? ELSE last_success END WHERE provider=?",
                    (int(success), int(not success), success, now(), provider),
                )
                for field, value in quota.items():
                    db.execute(
                        f"UPDATE usage SET {field}=?, confirmed=1 WHERE provider=?",
                        (value, provider),
                    )
                if response.status_code == 429:
                    retry = response.headers.get("retry-after", "60")
                    seconds = min(86400, max(1, int(retry))) if retry.isdigit() else 60
                    db.execute(
                        "UPDATE usage SET blocked_until=? WHERE provider=?",
                        (time.time() + seconds, provider),
                    )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError:
            raise ValueError(
                "Provider returned an HTTP error; inspect your key or try later."
            ) from None
        except (httpx.HTTPError, ValueError, KeyError):
            with connect() as db:
                db.execute(
                    "UPDATE usage SET failures=failures+1 WHERE provider=?", (provider,)
                )
            raise ValueError(
                "Provider request failed or returned an unsupported response."
            ) from None


def finding(source, title, value, evidence=None, confidence="high"):
    return dict(
        source=source,
        title=title,
        value=value,
        evidence=evidence,
        confidence=confidence,
        observed_at=now(),
    )


async def run_adapter(provider, query, kind):
    if provider == "github":
        import re

        if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", query):
            raise ValueError("This handle does not match GitHub username syntax.")
        data = await request(
            "github",
            "https://api.github.com/users/" + quote(query, safe=""),
            {
                "Accept": "application/vnd.github+json",
                "User-Agent": "Tracelet-local-OSINT",
            },
        )
        return [
            finding(
                "GitHub",
                "Public profile (possible username match)",
                {
                    k: data.get(k)
                    for k in [
                        "login",
                        "name",
                        "bio",
                        "blog",
                        "public_repos",
                        "created_at",
                        "updated_at",
                    ]
                },
                data.get("html_url"),
                "low",
            )
        ]
    if provider == "phone":
        import phonenumbers
        from phonenumbers import geocoder, carrier

        try:
            number = phonenumbers.parse(query, None)
        except phonenumbers.NumberParseException:
            raise ValueError(
                "Include an international country code, for example +44."
            ) from None
        return [
            finding(
                "libphonenumber",
                "Number format",
                dict(
                    international=phonenumbers.format_number(
                        number, phonenumbers.PhoneNumberFormat.INTERNATIONAL
                    ),
                    valid=phonenumbers.is_valid_number(number),
                    possible=phonenumbers.is_possible_number(number),
                    country=phonenumbers.region_code_for_number(number),
                    region=geocoder.description_for_number(number, "en"),
                    original_carrier=carrier.name_for_number(number, "en"),
                    note="Offline numbering-plan data. This does not identify a subscriber or confirm that a number is assigned.",
                ),
            )
        ]
    if provider == "dns":
        host = query.split("@")[-1] if kind == "email" else query
        results = []
        for record in ["A", "AAAA", "MX", "NS", "TXT"]:
            data = await request(
                "dns",
                "https://dns.google/resolve?name="
                + quote(host, safe="")
                + "&type="
                + record,
            )
            if data.get("Status") not in (0, 3):
                raise ValueError("Public DNS resolver could not answer this query.")
            answers = [item["data"] for item in data.get("Answer", [])]
            results.append(
                finding(
                    "Google Public DNS",
                    record + " records",
                    answers
                    or "No record returned (not evidence of absence elsewhere).",
                    "https://dns.google/query?name=" + host + "&type=" + record,
                )
            )
        return results
    if provider == "rdap":
        data = await request("rdap", "https://rdap.org/domain/" + quote(query, safe=""))
        return [
            finding(
                "RDAP",
                "Domain registration",
                {
                    key: data.get(key)
                    for key in [
                        "ldhName",
                        "status",
                        "events",
                        "nameservers",
                        "entities",
                    ]
                },
                "https://rdap.org/domain/" + query,
            )
        ]
    if provider == "virustotal":
        key = credential(provider)
        if not key:
            raise ValueError("API key required.")
        data = await request(
            provider,
            "https://www.virustotal.com/api/v3/domains/" + quote(query, safe=""),
            {"x-apikey": key},
        )
        attrs = data.get("data", {}).get("attributes", {})
        return [
            finding(
                "VirusTotal",
                "Domain reputation",
                {
                    k: attrs.get(k)
                    for k in ["last_analysis_stats", "reputation", "last_analysis_date"]
                },
                "https://www.virustotal.com/gui/domain/" + query,
            )
        ]
    return []
