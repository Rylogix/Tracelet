import ipaddress
import re
import socket
from urllib.parse import urlsplit


def public_domain(value: str) -> str:
    parsed = urlsplit(value if "://" in value else "https://" + value)
    if (
        parsed.scheme not in ("http", "https")
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 80, 443)
    ):
        raise ValueError("Use a public domain with no credentials or custom port.")
    host = (parsed.hostname or "").rstrip(".").encode("idna").decode()
    if not re.fullmatch(
        r"(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}",
        host,
    ):
        raise ValueError("Enter a valid public domain.")
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(
        not ipaddress.ip_address(item[4][0]).is_global for item in addresses
    ):
        raise ValueError("Private and internal network targets are not allowed.")
    return host.lower()


def detect(value: str) -> str:
    if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        return "email"
    if re.fullmatch(r"\+?[\d ()-]{7,25}", value):
        return "phone"
    if "." in value or "://" in value:
        return "website"
    if re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", value):
        return "username"
    raise ValueError(
        "Enter a username, email, international phone number, or public domain."
    )
