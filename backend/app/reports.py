import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from .db import connect

router = APIRouter()


def stamp():
    return datetime.now(timezone.utc).isoformat()


def snapshot(row):
    return {**json.loads(row["payload"]), **{k: row[k] for k in ("id", "title", "created", "updated", "revision")}, "archived": bool(row["archived"])}


async def body(request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 2000000:
            raise HTTPException(413, "Report is too large")
    try:
        return json.loads(data)
    except ValueError:
        raise HTTPException(422, "Invalid report") from None


def validate(value):
    if not isinstance(value, dict) or not isinstance(value.get("title"), str) or len(value["title"]) > 120 or not isinstance(value.get("revision"), int) or not isinstance(value.get("entries"), list) or len(value["entries"]) > 100:
        raise HTTPException(422, "Invalid report")
    ids = set()
    for entry in value["entries"]:
        job = entry.get("job") if isinstance(entry, dict) else None
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str) or len(entry["id"]) > 80 or entry["id"] in ids or not isinstance(entry.get("included"), bool) or not isinstance(job, dict) or not isinstance(job.get("id"), str) or not isinstance(job.get("query"), str) or len(job["query"]) > 500 or job.get("kind") not in ("username", "email", "phone", "file", "website") or not isinstance(job.get("status"), str) or any(not isinstance(job.get(k), list) for k in ("findings", "notes", "errors", "unavailable")):
            raise HTTPException(422, "Invalid report entry")
        ids.add(entry["id"])
        if any(not isinstance(f, dict) or any(not isinstance(f.get(k), str) for k in ("source", "title", "observed_at", "confidence")) for f in job["findings"]):
            raise HTTPException(422, "Invalid finding")
    if len(json.dumps(value, ensure_ascii=False).encode()) > 1900000:
        raise HTTPException(422, "Report is too large. Save this report and start another.")


@router.get("/api/workspace")
def workspace():
    with connect() as conn:
        now = stamp()
        conn.execute("INSERT OR IGNORE INTO reports VALUES(?,'local',? ,?,?,?,0,0)", (str(uuid.uuid4()), "Untitled report", '{"entries":[]}', now, now))
        return snapshot(conn.execute("SELECT * FROM reports WHERE owner='local' AND archived=0").fetchone())


@router.put("/api/workspace")
async def save(request: Request):
    value = await body(request)
    validate(value)
    with connect() as conn:
        row = conn.execute("UPDATE reports SET title=?,payload=?,updated=?,revision=revision+1 WHERE owner='local' AND id=? AND archived=0 AND revision=? RETURNING *", (value["title"], json.dumps({"entries": value["entries"]}), stamp(), value.get("id"), value["revision"])).fetchone()
        if not row:
            raise HTTPException(409, "This report changed in another tab. Reload before continuing.")
        return snapshot(row)


@router.get("/api/reports")
def history():
    with connect() as conn:
        return [dict(row) for row in conn.execute("SELECT id,title,created,updated,json_array_length(payload,'$.entries') AS count FROM reports WHERE owner='local' AND archived=1 ORDER BY updated DESC LIMIT 100")]


@router.post("/api/reports/archive")
async def archive(request: Request):
    value = await body(request)
    if not isinstance(value, dict) or not isinstance(value.get("id"), str) or not isinstance(value.get("revision"), int):
        raise HTTPException(422, "Invalid report")
    with connect() as conn:
        row = conn.execute("SELECT * FROM reports WHERE owner='local' AND id=? AND revision=? AND archived=0", (value.get("id"), value.get("revision"))).fetchone()
        if not row:
            raise HTTPException(409, "This report changed in another tab. Reload before continuing.")
        entries = [e for e in json.loads(row["payload"])["entries"] if e["included"]]
        if not entries or any(e["job"]["status"] in ("queued", "running") for e in entries):
            raise HTTPException(422, "Finish your searches before saving the report.")
        saved = conn.execute("UPDATE reports SET archived=1,payload=?,updated=?,revision=revision+1 WHERE id=? AND revision=? AND archived=0 RETURNING id", (json.dumps({"entries": entries}), stamp(), row["id"], row["revision"])).fetchone()
        if not saved:
            raise HTTPException(409, "This report changed in another tab. Reload before continuing.")
        return dict(saved)


@router.get("/api/reports/{report_id}")
def get_report(report_id: str):
    with connect() as conn:
        row = conn.execute("SELECT * FROM reports WHERE owner='local' AND id=? AND archived=1", (report_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Report not found")
        return snapshot(row)


@router.delete("/api/reports/{report_id}")
def delete_report(report_id: str):
    with connect() as conn:
        conn.execute("DELETE FROM reports WHERE owner='local' AND id=? AND archived=1", (report_id,))
    return {"ok": True}
