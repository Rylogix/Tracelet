"""Private HTTP service: no public routes, one bounded Sherlock child process."""
import asyncio
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, ConfigDict

from .scan import catalog

JOBS = {}
LOCK = asyncio.Lock()
TASKS = set()
MAX_SECONDS = 180


@asynccontextmanager
async def lifespan(app):
    yield
    for task in list(TASKS):
        task.cancel()
    await asyncio.gather(*TASKS, return_exceptions=True)


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


class Search(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-f0-9-]{36}$")
    username: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")


async def execute(job):
    process = None
    try:
        env = {k: v for k, v in os.environ.items() if k.upper() not in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")}
        # Development-only trusted proxy needed in the managed test environment.
        if os.environ.get("TRACELET_TEST_PROXY") == "1":
            env.update({k: v for k, v in os.environ.items() if k.upper() in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")})
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "service.scan", cwd=Path(__file__).parent.parent,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, env=env, limit=16384,
        )
        job["process"] = process
        process.stdin.write(json.dumps({"username": job["username"]}).encode())
        await process.stdin.drain()
        process.stdin.close()
        async with asyncio.timeout(MAX_SECONDS):
            async for line in process.stdout:
                item = json.loads(line)
                if item.get("platform") in catalog() and item.get("status") in ("found", "not_found", "unavailable", "skipped"):
                    job["checks"].append(item)
            await process.wait()
        job["status"] = "completed" if process.returncode == 0 else "partial"
    except TimeoutError:
        job["status"] = "partial"
        job["reason"] = "Search time limit reached"
    except asyncio.CancelledError:
        job["status"] = "cancelled"
        raise
    except (ValueError, OSError):
        job["status"] = "partial"
        job["reason"] = "Search interrupted"
    finally:
        if process and process.returncode is None:
            process.kill()
            await process.wait()
        job.pop("process", None)


def public(job):
    return {k: v for k, v in job.items() if k not in ("process", "task", "created")}


@app.get("/health")
def health():
    return {"status": "ok", "engine": "Sherlock", "version": "0.16.2", "total": len(catalog())}


@app.post("/jobs", status_code=202)
async def start(value: Search):
    if value.id in JOBS:
        return public(JOBS[value.id])
    for key in list(JOBS):
        if time.monotonic() - JOBS[key]["created"] > 600 and JOBS[key]["status"] != "running":
            del JOBS[key]
    if LOCK.locked():
        raise HTTPException(429, "Sherlock is busy. Try again shortly.", headers={"Retry-After": "30"})
    await LOCK.acquire()
    job = {"id": value.id, "username": value.username, "status": "running", "checks": [], "total": len(catalog()), "created": time.monotonic()}
    JOBS[value.id] = job
    task = asyncio.create_task(execute(job))
    job["task"] = task
    TASKS.add(task)
    def completed(task):
        TASKS.discard(task)
        LOCK.release()
        if task.cancelled():
            job["status"] = "cancelled"
    task.add_done_callback(completed)
    return public(job)


@app.get("/jobs/{job_id}")
def get(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "Search no longer available")
    return public(JOBS[job_id])


@app.delete("/jobs/{job_id}")
async def cancel(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "Search no longer available")
    task = JOBS[job_id].get("task")
    if task and not task.done():
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    return public(JOBS[job_id])
