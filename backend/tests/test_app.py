import json
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


def test_public_username_response_contracts():
    from app.usernames import PLATFORMS, interpret
    from pathlib import Path

    responses = json.loads(
        (
            Path(__file__).parents[2]
            / "cloudflare/tests/fixtures/username-responses.json"
        ).read_text()
    )
    for response in responses:
        platform = next(p for p in PLATFORMS if p["id"] == response["provider"])
        result = interpret(
            platform, response["target"], response["status"], response["data"]
        )
        assert result["status"] == response["expected"], response["provider"]
        if result["status"] == "found":
            assert result["finding"]["confidence"] == "low"
    for platform in PLATFORMS:
        assert interpret(platform, "example", 403, {})["status"] == "unavailable"
        assert interpret(platform, "example", 200, {})["status"] == "unavailable"


def test_explicit_username_type_overrides_domain_detection(client, monkeypatch):
    async def fake_execute(job, save):
        job.update(status="completed", checks=[], total=0)

    monkeypatch.setattr("app.usernames.execute_username", fake_execute)
    response = client.post(
        "/api/search",
        json={"query": "some.handle", "kind": "username"},
        headers=HEADERS,
    )
    assert response.status_code == 202
    assert response.json()["kind"] == "username"


def test_report_workflow_persistence_and_revision(client):
    draft = client.get('/api/workspace').json()
    def entry(name, included=True):
        return {'id': name, 'included': included, 'job': {'id': name, 'query': name, 'kind': 'phone', 'status': 'completed', 'findings': [], 'notes': [], 'errors': [], 'unavailable': []}}
    payload = {**draft, 'title': 'Case α', 'entries': [entry('keep'), entry('remove', False)]}
    saved = client.put('/api/workspace', json=payload, headers=HEADERS).json()
    assert saved['revision'] == 1
    assert client.put('/api/workspace', json=payload, headers=HEADERS).status_code == 409
    assert len(client.get('/api/workspace').json()['entries']) == 2
    assert client.post('/api/reports/archive', json={'id': draft['id'], 'revision': 1}, headers=HEADERS).status_code == 200
    archived = client.get('/api/reports/' + draft['id']).json()
    assert [e['id'] for e in archived['entries']] == ['keep']
    assert client.get('/api/workspace').json()['entries'] == []
    assert client.get('/api/reports').json()[0]['title'] == 'Case α'
    assert client.delete('/api/reports/' + draft['id'], headers=HEADERS).status_code == 200
    assert client.get('/api/reports/' + draft['id']).status_code == 404


def test_invalid_and_running_reports(client):
    draft = client.get('/api/workspace').json()
    assert client.put('/api/workspace', json={**draft, 'entries': [{'job': {}}]}, headers=HEADERS).status_code == 422
    assert client.post('/api/reports/archive', json={'id': draft['id'], 'revision': 0}, headers=HEADERS).status_code == 422

    running = {'id': 'running', 'included': True, 'job': {'id': 'running', 'query': 'alice', 'kind': 'username', 'status': 'running', 'findings': [], 'notes': [], 'errors': [], 'unavailable': []}}
    saved = client.put('/api/workspace', json={**draft, 'entries': [running]}, headers=HEADERS).json()
    assert client.post('/api/reports/archive', json={'id': draft['id'], 'revision': saved['revision']}, headers=HEADERS).status_code == 422


def test_richer_profile_fields_are_observed_and_not_contact_dumped():
    from app.usernames import PLATFORMS, interpret
    site = next(s for s in PLATFORMS if s['id'] == 'github')
    result = interpret(site, 'fixture', 200, {'login': 'fixture', 'bio': '<p>Public project</p>', 'public_repos': 7, 'followers': 0, 'email': 'do-not-copy@example.com'})
    value = result['finding']['value']
    assert value['bio'] == 'Public project'
    assert value['public_repositories'] == 7 and value['followers'] == 0
    assert 'email' not in value and 'created_at' not in value


def test_rdap_summary_omits_registrant_contacts():
    from app.enrichment import rdap_summary
    value = rdap_summary({'ldhName': 'EXAMPLE.COM', 'events': [{'eventAction': 'registration', 'eventDate': '2000-01-01'}], 'entities': [{'roles': ['registrant'], 'vcardArray': ['vcard', [['fn', {}, 'text', 'Private Person']]]}]})
    assert value['registered'] == '2000-01-01'
    assert 'Private Person' not in json.dumps(value)
    assert 'expires' not in value
