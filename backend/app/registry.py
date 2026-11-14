from .usernames import PLATFORMS
import importlib.util
import shutil

REGISTRY = [
    dict(
        id="username-discovery",
        name="Username search",
        description="Public profiles across 29 platforms.",
        kinds=["username"],
        license="Provider public API terms",
        credential=False,
        docs="https://github.com/Rylogix/Tracelet/blob/main/INTEGRATIONS.md",
        rate=None,
    ),
    dict(
        id="github",
        name="GitHub public profiles",
        description="Public GitHub account metadata; a matching handle does not establish identity",
        kinds=[],
        license="Provider terms (GitHub public REST API)",
        credential=False,
        docs="https://docs.github.com/en/rest/users/users",
        rate=10,
    ),
    dict(
        id="dns",
        name="DNS lookup",
        description="Public DNS records via Google Public DNS over HTTPS",
        kinds=["website", "email"],
        license="ISC (dnspython)",
        credential=False,
        package="dns",
        docs="https://developers.google.com/speed/public-dns/docs/doh",
        rate=120,
    ),
    dict(id="email-security",name="Email domain policies",description="Public SPF, DMARC, MTA-STS and TLS reporting records; shared DNS budget.",kinds=["email"],license="Google Public DNS terms",credential=False,docs="https://developers.google.com/speed/public-dns/docs/doh",rate=None),
    dict(
        id="rdap",
        name="RDAP",
        description="Public domain registration via RDAP.org bootstrap",
        kinds=["website"],
        license="Protocol / registry-specific data terms",
        credential=False,
        docs="https://about.rdap.org/",
        rate=10,
    ),
    dict(id="network",name="Public network",description="Public IP, prefix and ASN via Team Cymru DNS; shared DNS budget.",kinds=["website"],license="Team Cymru service / Google Public DNS terms",credential=False,docs="https://www.team-cymru.com/ip-asn-mapping",rate=None),
    dict(
        id="phone",
        name="libphonenumber",
        description="Offline number validation, country and region; no subscriber identification",
        kinds=["phone"],
        license="Apache-2.0",
        credential=False,
        package="phonenumbers",
        docs="https://github.com/daviddrysdale/python-phonenumbers",
        rate=None,
    ),
    dict(
        id="files",
        name="Local file analysis",
        description="Image metadata and PDF properties; analysis stays on your machine",
        kinds=["file"],
        license="HPND (Pillow), BSD-3-Clause (pypdf)",
        credential=False,
        package="PIL",
        docs="https://pypdf.readthedocs.io/",
        rate=None,
    ),
    dict(
        id="exiftool",
        name="ExifTool",
        description="Extended image, document and media metadata",
        kinds=["file"],
        license="Artistic-1.0-Perl OR GPL-1.0-or-later",
        credential=False,
        command="exiftool",
        restricted=True,
        docs="https://exiftool.org/",
        rate=None,
    ),
    dict(
        id="sherlock",
        name="Sherlock",
        description="Public username profiles; matching handles do not establish identity",
        kinds=[],
        license="MIT",
        credential=False,
        command="sherlock",
        docs="https://github.com/sherlock-project/sherlock",
        rate=None,
        restricted=True,
    ),
    dict(
        id="maigret",
        name="Maigret",
        description="Username discovery; optional adapter pending compatibility validation",
        kinds=[],
        license="MIT",
        credential=False,
        command="maigret",
        docs="https://github.com/soxoj/maigret",
        rate=None,
        restricted=True,
    ),
    dict(
        id="virustotal",
        name="VirusTotal",
        description="Optional domain reputation (no file uploads)",
        kinds=["website"],
        license="Provider terms",
        credential=True,
        free_tier=True,
        registration="https://www.virustotal.com/gui/join-us",
        docs="https://docs.virustotal.com/reference/overview",
        rate=4,
    ),
    dict(
        id="abuseipdb",
        name="AbuseIPDB",
        description="Optional IP reputation; adapter not enabled in this release",
        kinds=[],
        license="Provider terms",
        credential=True,
        free_tier=True,
        registration="https://www.abuseipdb.com/register",
        docs="https://docs.abuseipdb.com/",
        rate=None,
        restricted=True,
    ),
]


def integrations(include_platforms=False):
    from .db import credential, connect

    result = []
    items = REGISTRY
    if include_platforms:
        items = [
            *REGISTRY,
            *[
                dict(
                    id=s["id"],
                    name=s["name"],
                    description="",
                    kinds=["username"],
                    license=s["license"],
                    credential=False,
                    docs=s["docs"],
                    rate=s["safety_per_minute"],
                )
                for s in PLATFORMS
                if s["id"] != "github"
            ],
        ]
    for item in items:
        installed = (
            bool(shutil.which(item["command"]))
            if "command" in item
            else bool(importlib.util.find_spec(item["package"]))
            if "package" in item
            else True
        )
        connected = bool(credential(item["id"])) if item["credential"] else True
        validated = True
        if item["credential"]:
            with connect() as conn:
                row = conn.execute(
                    "SELECT last_success FROM usage WHERE provider=?", (item["id"],)
                ).fetchone()
            validated = bool(row and row[0])
        available = (
            installed and connected and validated and not item.get("restricted", False)
        )
        result.append(
            {
                **item,
                "installed": installed,
                "connected": connected,
                "available": available,
                "status": "Available"
                if available
                else "Not validated for execution"
                if item.get("restricted")
                else "API key required"
                if not connected
                else "Connection test required"
                if not validated
                else "Not installed",
                "quota_reporting": "Shared DNS provider limits" if item["id"] in ("email-security","network") else "Response headers when supplied; otherwise unknown"
                if item["credential"]
                else "Local request counts; allowance unknown"
                if item["rate"]
                else "Offline; no external quota",
                "timeout_seconds": 20,
                "cancellation": "Cooperative; subprocess terminated",
                "output": "Normalized findings with evidence and timestamps",
            }
        )
    return result
