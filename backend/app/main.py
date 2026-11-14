from typing import Literal
import asyncio
import json
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
from . import db
from .providers import run_adapter, finding, now
from .registry import integrations, REGISTRY
from .security import detect, public_domain

JOBS = {}
TASKS = {}
SEM = asyncio.Semaphore(3)
RECENT = []


@asynccontextmanager
async def lifespan(app):
    db.initialize()
    # Interrupted work never resumes silently.
    with db.connect() as conn:
        conn.execute(
            "DELETE FROM investigations WHERE julianday('now') - julianday(created) > 30"
        )
    yield
    for task in list(TASKS.values()):
        task.cancel()
    await asyncio.gather(*TASKS.values(), return_exceptions=True)


app = FastAPI(title="Tracelet local API", lifespan=lifespan)
from .reports import router as reports_router
app.include_router(reports_router)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "testserver", "backend"],
)


@app.middleware("http")
async def local_security(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ):
        return __import__(
            "starlette.responses", fromlist=["JSONResponse"]
        ).JSONResponse({"detail": "Cross-origin access denied"}, status_code=403)
    if (
        request.method not in ("GET", "HEAD", "OPTIONS")
        and request.headers.get("x-tracelet-client") != "local-ui"
    ):
        return __import__(
            "starlette.responses", fromlist=["JSONResponse"]
        ).JSONResponse({"detail": "Local client header required"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


class Search(BaseModel):
    kind: Literal["username", "email", "phone", "website"] | None = None
    query: str = Field(min_length=1, max_length=253)
    history: bool = False


class Key(BaseModel):
    key: str = Field(min_length=1, max_length=4096)


class Budget(BaseModel):
    requests: int | None = Field(default=None, ge=0, le=1000000)


class Setup(BaseModel):
    history: bool = False


def save(job):
    if job["history"]:
        with db.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO investigations VALUES(?,?,?,?,?,?)",
                (
                    job["id"],
                    job["query"],
                    job["kind"],
                    job["status"],
                    job["created"],
                    json.dumps(job),
                ),
            )


async def execute(job):
    async with SEM:
        job["status"] = "running"
        if job["kind"] == "username":
            from .usernames import execute_username

            try:
                await execute_username(job, lambda: save(job))
            except asyncio.CancelledError:
                job["status"] = "cancelled"
            finally:
                save(job)
                TASKS.pop(job["id"], None)
            return
        if job["kind"] == "email":
            job["findings"].append(finding("Email","Address components",{"address":job["query"],"local_part":job["query"].split("@")[0],"domain":job["target"],"note":"Address syntax and public domain configuration only. No mailbox or account existence is inferred."}))
        available = [i for i in integrations() if job["kind"] in i["kinds"]]
        providers = [
            i
            for i in available
            if i["available"] and i["id"] != "files" and i["id"] != "exiftool"
        ]
        job["unavailable"] = [
            {"name": i["name"], "reason": i["status"]}
            for i in available
            if not i["available"]
        ]
        if job["kind"] == "email":
            job["notes"].append(
                "Only domain mail configuration is inspected. No mailbox existence or account exposure is inferred."
            )
        if job["kind"] == "username":
            job["notes"].append(
                "GitHub public profiles are checked. Broader username tools remain disabled pending compatibility review. Matching handles are never proof of identity."
            )

        async def one(item):
            streamed=False
            async def emit(value):
                nonlocal streamed
                streamed=True
                job["findings"].append(value)
                save(job)
            try:
                async with asyncio.timeout(75):
                    results = await run_adapter(item["id"], job["target"], job["kind"], emit)
                if not streamed:
                    job["findings"].extend(results)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                job["errors"].append(
                    {"source": item["name"], "message": str(exc)[:200]}
                )
            finally:
                job["completed"] += 1

        job["total"] = len(providers)
        try:
            for provider in providers:
                await one(provider)
            job["status"] = "completed" if not job["errors"] else "partial"
        except asyncio.CancelledError:
            job["status"] = "cancelled"
        finally:
            save(job)
            TASKS.pop(job["id"], None)


@app.get("/api/health")
def health():
    return {"status": "ok", "storage": "local SQLite", "version": "0.1.0"}


@app.get("/api/setup")
def setup_status():
    with db.connect() as conn:
        values = dict(conn.execute("SELECT key,value FROM settings").fetchall())
    return {
        "complete": values.get("complete") == "true",
        "history": values.get("history") == "true",
        "retention_days": 30,
        "os": __import__("platform").system(),
        "integrations": integrations(),
    }


@app.post("/api/setup")
def setup(value: Setup):
    with db.connect() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO settings VALUES(?,?)",
            [("complete", "true"), ("history", str(value.history).lower())],
        )
    return {"ok": True}


@app.get("/api/integrations")
def get_integrations():
    return integrations()


@app.put("/api/integrations/{provider}/key")
def put_key(provider: str, value: Key):
    if provider not in [i["id"] for i in REGISTRY if i["credential"]]:
        raise HTTPException(404, "Unknown credential integration")
    with db.connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO credentials VALUES(?,?)",
            (provider, db.cipher().encrypt(value.key.encode()).decode()),
        )
        conn.execute("UPDATE usage SET last_success=NULL WHERE provider=?", (provider,))
    return {"connected": True, "masked": "••••••••"}


@app.delete("/api/integrations/{provider}/key")
def remove_key(provider: str):
    with db.connect() as conn:
        conn.execute("DELETE FROM credentials WHERE provider=?", (provider,))
    return {"connected": False}


@app.post("/api/integrations/{provider}/test")
async def test_key(provider: str):
    if provider != "virustotal":
        raise HTTPException(
            400, "No validated connection test is available for this provider."
        )
    try:
        await run_adapter(provider, "example.com", "website")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    return {
        "ok": True,
        "note": "Connection tested with one domain lookup; counted in local usage.",
    }


@app.get("/api/usage")
def usage():
    with db.connect() as conn:
        rows = {
            row["provider"]: dict(row) for row in conn.execute("SELECT * FROM usage")
        }
    result = []
    for item in integrations(include_platforms=True):
        if item["rate"] is None:
            continue
        row = rows.get(
            item["id"],
            {
                "attempts": 0,
                "successes": 0,
                "failures": 0,
                "quota_limit": None,
                "remaining": None,
                "reset": None,
                "last_success": None,
                "last_update": None,
                "confirmed": 0,
                "budget": None,
                "blocked_until": 0,
            },
        )
        percent = (
            ((row["quota_limit"] - row["remaining"]) / row["quota_limit"] * 100)
            if row.get("quota_limit") and row.get("remaining") is not None
            else None
        )
        result.append(
            {
                **row,
                "provider": item["id"],
                "name": item["name"],
                "kinds": item["kinds"],
                "available": item["available"],
                "unit": "requests",
                "source": "provider headers"
                if row["confirmed"]
                else "local attempts; provider allowance unknown",
                "percentage": percent,
                "alerts": [
                    n
                    for n in get_alert_settings()["thresholds"]
                    if percent is not None and percent >= n
                ],
                "safety_limit_per_minute": item["rate"],
                "reset_frequency": "unknown",
            }
        )
    return result


@app.put("/api/usage/{provider}/budget")
def budget(provider: str, value: Budget):
    if provider not in [
        i["id"] for i in integrations(include_platforms=True) if i["rate"]
    ]:
        raise HTTPException(404, "Unknown provider")
    with db.connect() as conn:
        conn.execute("INSERT OR IGNORE INTO usage(provider) VALUES(?)", (provider,))
        conn.execute(
            "UPDATE usage SET budget=? WHERE provider=?", (value.requests, provider)
        )
    return {"ok": True}


@app.post("/api/search", status_code=202)
async def search(value: Search):
    current = time.monotonic()
    RECENT[:] = [t for t in RECENT if current - t < 60]
    if (
        len(RECENT) >= 10
        or sum(j["status"] in ("queued", "running") for j in JOBS.values()) >= 8
    ):
        raise HTTPException(429, "Local search limit reached; try again shortly.")
    query = value.query.strip()
    try:
        kind = value.kind or detect(query)
        import re

        if kind == "username" and not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", query
        ):
            raise ValueError("Invalid username.")
        if kind == "email" and detect(query) != "email":
            raise ValueError("Invalid email.")
        target = (
            await asyncio.to_thread(
                public_domain, query.split("@")[-1] if kind == "email" else query
            )
            if kind in ("email", "website")
            else query
        )
    except (ValueError, OSError) as exc:
        raise HTTPException(422, str(exc)) from None
    RECENT.append(current)
    # In-memory cache never persists searches without opt-in.
    for prior in JOBS.values():
        if (
            prior["query"] == query
            and prior["kind"] == kind
            and prior["status"] == "completed"
            and current - prior["started"] < 300
        ):
            if value.history and not prior["history"]:
                prior["history"] = True
                save(prior)
            return {**prior, "cached": True}
    if len(JOBS) >= 200:
        for key in list(JOBS):
            if JOBS[key]["status"] not in ("queued", "running"):
                del JOBS[key]
                break
    job = dict(
        id=str(uuid.uuid4()),
        query=query,
        target=target,
        kind=kind,
        status="queued",
        created=now(),
        started=current,
        history=value.history,
        findings=[],
        errors=[],
        notes=[],
        unavailable=[],
        completed=0,
        total=0,
    )
    JOBS[job["id"]] = job
    TASKS[job["id"]] = asyncio.create_task(execute(job))
    return job


@app.get("/api/search/{job_id}")
def get_job(job_id: str):
    if job_id in JOBS:
        return JOBS[job_id]
    with db.connect() as conn:
        row = conn.execute(
            "SELECT payload FROM investigations WHERE id=?", (job_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Search not found")
    result = json.loads(row[0])
    if result["status"] in ("queued", "running"):
        result["status"] = "interrupted"
    return result


@app.post("/api/search/{job_id}/cancel")
async def cancel(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "Search not found")
    task = TASKS.get(job_id)
    if task:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        TASKS.pop(job_id, None)
        JOBS[job_id]["status"] = "cancelled"
        save(JOBS[job_id])
    return JOBS[job_id]


@app.get("/api/history")
def history():
    with db.connect() as conn:
        return [
            dict(row)
            for row in conn.execute(
                "SELECT id,query,kind,status,created FROM investigations ORDER BY created DESC LIMIT 100"
            )
        ]


@app.delete("/api/history")
def clear_history():
    with db.connect() as conn:
        conn.execute("DELETE FROM investigations")
    for job in JOBS.values():
        job["history"] = False
    return {"ok": True}


@app.post("/api/files")
async def file_analysis(file: UploadFile = File(...)):
    data = await file.read(10 * 1024 * 1024 + 1)
    await file.close()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "Maximum file size is 10 MB.")
    import sys

    async with SEM:
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            str(Path(__file__).with_name("file_worker.py")),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            output, _ = await asyncio.wait_for(process.communicate(data), timeout=12)
            if process.returncode or len(output) > 1024 * 1024:
                raise ValueError("Parser refused file")
            parsed = json.loads(output)
            results = [finding(parsed["source"], parsed["title"], parsed["value"])]
        except (ValueError, KeyError, asyncio.TimeoutError):
            raise HTTPException(
                422,
                "Unsupported, encrypted, oversized, or invalid file. This release supports images and PDFs.",
            ) from None
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
    return {
        "findings": results,
        "notes": [
            "Analyzed in an isolated subprocess. No upload retained. Metadata may contain personal information."
        ],
    }


class AlertSettings(BaseModel):
    thresholds: list[int] = Field(default=[50, 80, 90, 100], max_length=4)


@app.get("/api/usage/alerts")
def get_alert_settings():
    with db.connect() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key='quota_alerts'"
        ).fetchone()
    return {"thresholds": json.loads(row[0]) if row else [50, 80, 90, 100]}


@app.put("/api/usage/alerts")
def put_alert_settings(value: AlertSettings):
    if any(n not in (50, 80, 90, 100) for n in value.thresholds):
        raise HTTPException(422, "Choose supported thresholds")
    with db.connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings VALUES(?,?)",
            ("quota_alerts", json.dumps(sorted(set(value.thresholds)))),
        )
    return {"ok": True}
