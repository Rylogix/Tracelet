import asyncio
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from .db import connect
from .providers import request, finding

PLATFORMS = json.loads(Path(__file__).with_name("username_platforms.json").read_text())


def field(data, path):
    for key in path.split(".") if path else []:
        try:
            data = data[int(key)] if isinstance(data, list) else data[key]
        except (ValueError, TypeError, KeyError, IndexError):
            return None
    return data


def normalize(value, site):
    return (value.replace("_", " ") if site.get("normalize_spaces") else value).lower()


def present(data, path):
    parts = path.split(".")
    parent = field(data, ".".join(parts[:-1])) if len(parts) > 1 else data
    return (
        isinstance(parent, dict)
        and parts[-1] in parent
        or isinstance(parent, list)
        and parts[-1].isdigit()
        and int(parts[-1]) < len(parent)
    )


def interpret(site, target, status, data):
    base = {"platform": site["name"], "provider": site["id"]}
    if site["id"]=="opencollective" and isinstance(data, dict) and data.get("errors"):
        return {**base, "status": "unavailable", "reason": "Provider error"}
    if (
        status == 404
        or site.get("null_missing")
        and data is None
        or site.get("missing_path")
        and present(data, site["missing_path"])
        and field(data, site["missing_path"]) in site.get("missing_values", [])
    ):
        return {**base, "status": "not_found"}
    if status != 200:
        return {
            **base,
            "status": "unavailable",
            "reason": "Blocked"
            if status == 403
            else "Rate limited"
            if status == 429
            else "HTTP " + str(status),
        }
    expected = (
        (target if "." in target else target + ".bsky.social")
        if site["id"] == "bluesky"
        else target
    )
    account = data
    if "collection" in site:
        records = field(data, site["collection"])
        if not isinstance(records, list):
            return {**base, "status": "unavailable", "reason": "Unexpected response"}
        if not records:
            return {**base, "status": "not_found"}
        account = next(
            (
                a
                for a in records
                if isinstance(field(a, site["identity"]), str)
                and normalize(field(a, site["identity"]), site)
                == normalize(expected, site)
            ),
            None,
        )
    identity = field(account, site["identity"])
    if not isinstance(identity, str) or normalize(identity, site) != normalize(
        expected, site
    ):
        return {**base, "status": "unavailable", "reason": "Profile not confirmed"}
    identity_id = str(field(account, site["id_path"])) if site.get("id_path") else ""
    if site.get("id_path") and not identity_id.isdigit():
        return {**base, "status": "unavailable", "reason": "Invalid profile ID"}
    url = (
        site["url"]
        .replace("{username}", quote(target, safe=""))
        .replace("{handle}", quote(expected, safe=""))
        .replace("{id}", identity_id)
    )
    display = field(account, site["display"]) if site.get("display") else None
    value = {"username": identity}
    if isinstance(display, str) and display.strip():
        value["name"] = display.strip()[:200]
    for name, spec in site.get("fields", {}).items():
        item = field(account, spec if isinstance(spec,str) else spec["path"])
        if isinstance(spec,dict) and isinstance(item,(int,float)):
            try:
                item = datetime.fromtimestamp(item if spec["format"]=="unix" else item/1000,timezone.utc).isoformat().replace("+00:00","Z")
            except (ValueError,OverflowError,OSError):
                item = None
        if isinstance(item,str):
            item = re.sub(r"\s+"," ",re.sub(r"<[^>]*>"," ",item)).strip()[:1600]
        if item != "" and isinstance(item,(str,int,float,bool)):
            value[name] = item
    return {
        **base,
        "status": "found",
        "url": url,
        "finding": finding(site["name"], "@" + identity, value, url, "low"),
    }


async def check_profile(site, target):
    base = {"platform": site["name"], "provider": site["id"]}
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", target):
        return {**base, "status": "skipped", "reason": "Unsupported username format"}
    with connect() as db:
        cached = db.execute(
            "SELECT payload FROM provider_cache WHERE provider=? AND query=? AND expires>?",
            (site["id"], "v2:"+target, time.time()),
        ).fetchone()
    if cached:
        return {**json.loads(cached[0]), "cached": True}

    def fmt(value, encode=False):
        handle = target if "." in target else target + ".bsky.social"
        return value.replace(
            "{username}", quote(target, safe="") if encode else target
        ).replace("{handle}", quote(handle, safe="") if encode else handle)

    try:
        result = await request(
            site["id"],
            fmt(site["endpoint"], True),
            {
                "User-Agent": "Tracelet/0.2 (+https://github.com/Rylogix/Tracelet)",
                "Accept": "application/json",
            },
            method=site.get("method", "GET"),
            body=json.loads(fmt(json.dumps(site["body"])))
            if site.get("body")
            else None,
            envelope=True,
            timeout=4,
        )
        check = interpret(site, target, result["status"], result["data"])
        if check["status"] in ("found", "not_found"):
            with connect() as db:
                db.execute(
                    "INSERT OR REPLACE INTO provider_cache VALUES(?,?,?,?)",
                    (site["id"], "v2:"+target, json.dumps(check), time.time() + 300),
                )
        return check
    except Exception as exc:
        return {
            **base,
            "status": "unavailable",
            "reason": "Budget or quota limit"
            if "budget" in str(exc).lower() or "allowance" in str(exc).lower()
            else "Request failed",
        }


async def execute_username(job, save):
    job.update(
        checks=[],
        total=len(PLATFORMS),
        completed=0,
        notes=["Matching usernames do not establish identity."],
    )
    semaphore = asyncio.Semaphore(6)

    async def one(site):
        async with semaphore:
            check = await check_profile(site, job["target"])
            match = check.pop("finding", None)
            job["checks"].append(check)
            if match:
                job["findings"].append(match)
            job["completed"] += 1
            save()

    await asyncio.gather(*(one(site) for site in PLATFORMS))
    job["status"] = (
        "partial"
        if any(c["status"] == "unavailable" for c in job["checks"])
        else "completed"
    )
