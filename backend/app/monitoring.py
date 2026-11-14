import asyncio
import json
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import urlsplit, quote
from .db import connect
from .providers import request, now


def github_handle(url):
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "github.com"
        or parsed.query
        or parsed.fragment
    ):
        return None
    handle = parsed.path.strip("/")
    return (
        handle
        if re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", handle)
        else None
    )


async def fetch_profile(handle):
    if not handle:
        raise ValueError("Unsupported profile URL")
    data = await request(
        "github",
        "https://api.github.com/users/" + quote(handle, safe=""),
        {"Accept": "application/vnd.github+json", "User-Agent": "Tracelet-local-OSINT"},
    )
    # Exclude location and other fields not needed for user-owned profile monitoring.
    return {
        key: data.get(key) for key in ["login", "bio", "blog", "name", "public_repos"]
    }


async def scan_due():
    with connect() as db:
        rows = [
            dict(r)
            for r in db.execute(
                "SELECT f.id,f.url,o.* FROM footprint f JOIN ownership o ON f.id=o.profile_id WHERE o.verified=1 AND o.monitoring=1"
            )
        ]
    for row in rows:
        if (
            row["last_scan"]
            and (
                datetime.now(timezone.utc) - datetime.fromisoformat(row["last_scan"])
            ).total_seconds()
            < row["interval_hours"] * 3600
        ):
            continue
        try:
            data = await fetch_profile(github_handle(row["url"]))
            snapshot = json.dumps(data, sort_keys=True)
            with connect() as db:
                if row["snapshot"] and snapshot != row["snapshot"]:
                    db.execute(
                        "INSERT INTO alerts VALUES(?,?,?,?)",
                        (
                            str(uuid.uuid4()),
                            row["id"],
                            now(),
                            "Your verified public GitHub profile changed. Review the account directly for details.",
                        ),
                    )
                db.execute(
                    "UPDATE ownership SET snapshot=?,last_scan=? WHERE profile_id=?",
                    (snapshot, now(), row["id"]),
                )
        except ValueError:
            # No retries until the next local cycle; provider budget and cooldown still apply.
            continue


async def monitor_loop():
    while True:
        await scan_due()
        await asyncio.sleep(60)
