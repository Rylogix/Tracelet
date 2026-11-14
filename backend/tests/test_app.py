import asyncio
import io
import socket
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app import db
from app.main import app, JOBS, RECENT
from app.security import detect, public_domain

HEADERS = {"X-Tracelet-Client": "local-ui"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DATA", tmp_path)
    JOBS.clear()
    RECENT.clear()
    with TestClient(app) as client:
        yield client


def test_detection():
    assert detect("alice") == "username"
    assert detect("hello@example.com") == "email"
    assert detect("+442079460018") == "phone"
    assert detect("example.com") == "website"


@pytest.mark.parametrize(
    "value",
    [
        "localhost",
        "127.0.0.1",
        "http://user:pass@example.com",
        "https://example.com:9000",
        "file:///etc/passwd",
        "a;echo hi",
    ],
)
def test_reject_unsafe_targets(value):
    with pytest.raises(ValueError):
        public_domain(value)


def test_dns_private_rejected(monkeypatch):
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("127.0.0.1", 443))]
    )
    with pytest.raises(ValueError):
        public_domain("evil.example")


def test_csrf_and_origin(client):
    assert client.post("/api/setup", json={}).status_code == 403
    assert (
        client.post(
            "/api/setup", json={}, headers={**HEADERS, "Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert (
        client.get("/api/health", headers={"Host": "evil.example"}).status_code == 400
    )


def test_secrets_encrypted_never_returned(client):
    secret = "tracelet-test-secret-do-not-expose"
    assert (
        client.put(
            "/api/integrations/virustotal/key", json={"key": secret}, headers=HEADERS
        ).status_code
        == 200
    )
    assert secret not in client.get("/api/integrations").text
    provider = next(
        i for i in client.get("/api/integrations").json() if i["id"] == "virustotal"
    )
    assert provider["connected"] and not provider["available"]
    assert provider["status"] == "Connection test required"
    assert secret not in client.get("/api/usage").text
    with db.connect() as conn:
        encrypted = conn.execute("SELECT encrypted FROM credentials").fetchone()[0]
    assert secret not in encrypted
    assert db.credential("virustotal") == secret
    assert (db.DATA / "secret.key").stat().st_mode & 0o777 == 0o600
    client.delete("/api/integrations/virustotal/key", headers=HEADERS)
    assert db.credential("virustotal") is None


def test_unknown_quotas(client):
    for row in client.get("/api/usage").json():
        assert row["quota_limit"] is None
        assert row["remaining"] is None
        assert row["reset"] is None
        assert row["percentage"] is None


def test_phone_real_integration_and_history(client):
    result = client.post(
        "/api/search", json={"query": "+442079460018", "history": True}, headers=HEADERS
    )
    assert result.status_code == 202
    import time

    for _ in range(100):
        job = client.get("/api/search/" + result.json()["id"]).json()
        if job["status"] not in ["queued", "running"]:
            break
        time.sleep(0.01)
    assert job["status"] == "completed"
    assert job["findings"][0]["value"]["country"] == "GB"
    assert len(client.get("/api/history").json()) == 1
    client.delete("/api/history", headers=HEADERS)
    assert client.get("/api/history").json() == []


def test_image_real_integration(client):
    buffer = io.BytesIO()
    Image.new("RGB", (3, 4)).save(buffer, "PNG")
    result = client.post(
        "/api/files",
        files={"file": ("test.png", buffer.getvalue(), "image/png")},
        headers=HEADERS,
    )
    assert result.status_code == 200
    assert result.json()["findings"][0]["value"]["width"] == 3
    assert not list(db.DATA.glob("*.png"))
    assert (
        client.post(
            "/api/files", files={"file": ("bad.pdf", b"not a file")}, headers=HEADERS
        ).status_code
        == 422
    )


def test_budget_exhaustion_blocks_network(client, monkeypatch):
    from app.providers import request, LOCKS

    LOCKS.clear()
    client.put("/api/usage/rdap/budget", json={"requests": 0}, headers=HEADERS)
    with pytest.raises(ValueError, match="budget"):
        asyncio.run(request("rdap", "https://rdap.org/domain/example.com"))
    row = next(r for r in client.get("/api/usage").json() if r["provider"] == "rdap")
    assert row["attempts"] == 0


def test_concurrent_budget_atomic(client, monkeypatch):
    import httpx
    from app.providers import request, LOCKS, LAST

    LOCKS.clear()
    LAST.clear()
    client.put("/api/usage/virustotal/budget", json={"requests": 1}, headers=HEADERS)

    async def fake_get(self, url, **kwargs):
        return httpx.Response(
            200,
            json={"ok": True},
            request=httpx.Request("GET", url),
            headers={"x-ratelimit-limit": "100", "x-ratelimit-remaining": "99"},
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    async def run():
        return await asyncio.gather(
            request("virustotal", "https://example.com"),
            request("virustotal", "https://example.com"),
            return_exceptions=True,
        )

    results = asyncio.run(run())
    assert sum(isinstance(r, ValueError) for r in results) == 1
    row = next(
        r for r in client.get("/api/usage").json() if r["provider"] == "virustotal"
    )
    assert row["attempts"] == 1 and row["successes"] == 1 and row["remaining"] == 99
    assert row["source"] == "provider headers"


def test_footprint_never_claims_verified(client, monkeypatch):
    monkeypatch.setattr("app.main.public_domain", lambda url: "example.com")
    response = client.post(
        "/api/footprint",
        json={"username": "mine", "url": "https://example.com/me"},
        headers=HEADERS,
    )
    assert response.json()["status"] == "unverified"
    assert (
        client.delete(
            "/api/footprint/" + response.json()["id"], headers=HEADERS
        ).status_code
        == 200
    )


def test_monitoring_requires_ownership_proof(client, monkeypatch):
    monkeypatch.setattr("app.main.public_domain", lambda url: "github.com")
    profile = client.post(
        "/api/footprint",
        json={"username": "mine", "url": "https://github.com/mine"},
        headers=HEADERS,
    ).json()
    assert (
        client.put(
            "/api/footprint/" + profile["id"] + "/monitoring",
            json={"enabled": True},
            headers=HEADERS,
        ).status_code
        == 400
    )
    token = client.post(
        "/api/footprint/" + profile["id"] + "/challenge", headers=HEADERS
    ).json()["challenge"]

    async def no_token(handle):
        return {"login": "mine", "bio": "unrelated"}

    monkeypatch.setattr("app.monitoring.fetch_profile", no_token)
    assert (
        client.post(
            "/api/footprint/" + profile["id"] + "/verify", headers=HEADERS
        ).status_code
        == 400
    )

    async def valid(handle):
        return {"login": "mine", "bio": token}

    monkeypatch.setattr("app.monitoring.fetch_profile", valid)
    assert client.post(
        "/api/footprint/" + profile["id"] + "/verify", headers=HEADERS
    ).json()["verified"]
    assert (
        client.put(
            "/api/footprint/" + profile["id"] + "/monitoring",
            json={"enabled": True},
            headers=HEADERS,
        ).status_code
        == 200
    )


def test_configurable_usage_alerts(client):
    assert (
        client.put(
            "/api/usage/alerts", json={"thresholds": [80, 100]}, headers=HEADERS
        ).status_code
        == 200
    )
    assert client.get("/api/usage/alerts").json()["thresholds"] == [80, 100]
    assert (
        client.put(
            "/api/usage/alerts", json={"thresholds": [72]}, headers=HEADERS
        ).status_code
        == 422
    )
