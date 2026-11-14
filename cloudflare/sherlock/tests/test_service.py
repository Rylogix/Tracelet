import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient
from sherlock_project.result import QueryResult, QueryStatus
from service import app as service
from service.scan import catalog, normalize
from service import scan


@pytest.mark.parametrize("code", [401, 403, 429, 500, 502, "?"])
def test_http_errors_cannot_produce_matches(code):
    result = QueryResult("test", "Example", "https://example.com/test", QueryStatus.CLAIMED)
    assert normalize(result, {"http_status": code})["status"] == "unavailable"


def test_blocked_is_not_absent():
    result = QueryResult("test", "Example", "https://example.com/test", QueryStatus.WAF)
    assert normalize(result, {"http_status": 200})["status"] == "unavailable"


def test_catalog_is_bundled_and_read_only():
    sites = catalog()
    assert len(sites) > 300
    assert all(not site.get("isNSFW") for site in sites.values())
    assert all(site.get("request_method", "GET") in ("GET", "HEAD") for site in sites.values())
    assert all(site["url"].startswith("https://") for site in sites.values())


def test_private_destinations_are_blocked(monkeypatch, capsys):
    site = catalog()["GitHub"].copy()
    site["url"] = "https://127.0.0.1/{}"
    site.pop("urlProbe", None)
    monkeypatch.setattr(scan, "catalog", lambda: {"GitHub": site})
    monkeypatch.delenv("TRACELET_TEST_PROXY", raising=False)
    # Register restoration for the process-local request/DNS guards.
    monkeypatch.setattr(scan.socket, "getaddrinfo", scan.socket.getaddrinfo)
    monkeypatch.setattr(scan.requests.Session, "send", scan.requests.Session.send)
    scan.run("octocat")
    assert '"status": "unavailable"' in capsys.readouterr().out


def test_validation_cancellation_and_busy_gate(monkeypatch):
    async def waiting(job):
        await asyncio.sleep(100)
    monkeypatch.setattr(service, "execute", waiting)
    service.JOBS.clear()
    service.LOCK = asyncio.Lock()
    with TestClient(service.app) as client:
        assert client.get("/health").json()["version"] == "0.16.2"
        for username in ["--help", "../test", "x;id", "https://localhost", "a" * 81]:
            assert client.post("/jobs", json={"id": str(uuid.uuid4()), "username": username}).status_code == 422
        assert client.post("/jobs", json={"id": str(uuid.uuid4()), "username": "test", "sites": ["https://localhost"]}).status_code == 422
        job_id = str(uuid.uuid4())
        value = {"id": job_id, "username": "test"}
        assert client.post("/jobs", json=value).status_code == 202
        assert client.post("/jobs", json=value).status_code == 202
        assert client.post("/jobs", json={**value, "id": str(uuid.uuid4())}).status_code == 429
        assert client.delete("/jobs/" + job_id).json()["status"] == "cancelled"
        assert not service.LOCK.locked()
        assert client.get("/jobs/" + str(uuid.uuid4())).status_code == 404
