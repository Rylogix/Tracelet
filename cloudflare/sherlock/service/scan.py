"""Isolated Sherlock runner. Only bundled catalog entries may select targets."""
import copy
import ipaddress
import json
import os
import socket
import sys
from pathlib import Path
from urllib.parse import urlsplit

import requests
from sherlock_project.notify import QueryNotify
from sherlock_project.result import QueryStatus
from sherlock_project.sherlock import sherlock

ROOT = Path(__file__).parent


def catalog():
    excluded = set((ROOT / "exclusions.txt").read_text().splitlines())
    return {
        name: site for name, site in json.loads((ROOT / "catalog.json").read_text()).items()
        if isinstance(site, dict) and name not in excluded and not site.get("isNSFW")
        and site.get("request_method", "GET") in ("GET", "HEAD")
        and urlsplit(site.get("url", "")).scheme == "https"
        and urlsplit(site.get("urlProbe", site.get("url", ""))).scheme == "https"
    }


def normalize(result, response):
    code = response.get("http_status")
    status = result.status
    if status == QueryStatus.ILLEGAL:
        return {"provider": "sherlock", "platform": result.site_name, "status": "skipped"}
    if not isinstance(code, int) or code < 200 or code >= 500 or (code >= 400 and code != 404) or (code == 404 and status == QueryStatus.CLAIMED) or status in (QueryStatus.WAF, QueryStatus.UNKNOWN):
        state = "unavailable"
    elif status == QueryStatus.ILLEGAL:
        state = "skipped"
    elif status == QueryStatus.CLAIMED:
        state = "found"
    else:
        state = "not_found"
    item = {"provider": "sherlock", "platform": result.site_name, "status": state}
    if state == "unavailable":
        item["reason"] = "Rate limited" if code == 429 else "Blocked" if code in (401, 403) else "Not confirmed"
    if state == "found":
        item["url"] = result.site_url_user
    return item


def run(username, names=None):
    sites = catalog()
    if names is not None:
        sites = {name: sites[name] for name in names if name in sites}
    # Validate DNS both before requests and at actual socket resolution. Redirects
    # also pass through Session.send. No user URLs, proxies or command flags.
    original_resolve = socket.getaddrinfo

    def public_resolve(host, *args, **kwargs):
        addresses = original_resolve(host, *args, **kwargs)
        trusted_proxy = os.environ.get("TRACELET_TEST_PROXY") == "1" and host == urlsplit(os.environ.get("HTTPS_PROXY", "")).hostname
        if not trusted_proxy and (not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses)):
            raise OSError("Non-public destination blocked")
        return addresses

    socket.getaddrinfo = public_resolve
    original_send = requests.Session.send

    def safe_send(session, request, **kwargs):
        target = urlsplit(request.url)
        if target.scheme != "https" or target.username or target.password or target.port not in (None, 443):
            raise requests.RequestException("Unsupported destination")
        try:
            public_resolve(target.hostname, 443)
        except OSError as exc:
            raise requests.RequestException("Non-public destination blocked") from exc
        kwargs["stream"] = True
        response = original_send(session, request, **kwargs)
        content = bytearray()
        for chunk in response.iter_content(65536):
            content.extend(chunk)
            if len(content) > 2 * 1024 * 1024:
                response.close()
                raise requests.RequestException("Response too large")
        response._content = bytes(content)
        response._content_consumed = True
        return response

    requests.Session.send = safe_send
    priority = ["GitHub", "GitLab", "DEV Community", "Chess", "Lichess", "HackerNews", "Docker Hub", "Reddit", "Instagram", "YouTube"]
    names = [n for n in priority if n in sites] + [n for n in sites if n not in priority]
    # Bound both concurrent requests and retained page bodies to 20 sites.
    for start in range(0, len(names), 20):
        batch = {name: copy.deepcopy(sites[name]) for name in names[start:start + 20]}
        results = sherlock(username, batch, QueryNotify(), timeout=4)
        for result in results.values():
            print(json.dumps(normalize(result["status"], result)), flush=True)


if __name__ == "__main__":
    value = json.loads(sys.stdin.read(8192))
    run(value["username"], value.get("sites"))
