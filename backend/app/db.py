import time
import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from cryptography.fernet import Fernet

DATA = Path(os.environ.get("TRACELET_DATA", "data")).resolve()


def initialize():
    DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = DATA / "secret.key"
    if not key.exists():
        fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(Fernet.generate_key())
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
        INSERT OR IGNORE INTO migrations VALUES(1);
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS investigations(id TEXT PRIMARY KEY, query TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS credentials(provider TEXT PRIMARY KEY, encrypted TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS usage(provider TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, successes INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, last_success TEXT, last_update TEXT, quota_limit REAL, remaining REAL, reset TEXT, confirmed INTEGER NOT NULL DEFAULT 0, blocked_until REAL NOT NULL DEFAULT 0, budget INTEGER);
        INSERT OR IGNORE INTO migrations VALUES(2);
        CREATE TABLE IF NOT EXISTS provider_cache(provider TEXT NOT NULL,query TEXT NOT NULL,payload TEXT NOT NULL,expires REAL NOT NULL,PRIMARY KEY(provider,query));
        INSERT OR IGNORE INTO migrations VALUES(3);
        DROP TABLE IF EXISTS ownership;
        DROP TABLE IF EXISTS alerts;
        DROP TABLE IF EXISTS footprint;
        INSERT OR IGNORE INTO migrations VALUES(4);
        """)
        db.execute("DELETE FROM provider_cache WHERE expires<?", (time.time(),))


@contextmanager
def connect():
    db = sqlite3.connect(DATA / "tracelet.db", timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
        db.commit()
    finally:
        db.close()


def cipher():
    return Fernet((DATA / "secret.key").read_bytes())


def credential(provider):
    with connect() as db:
        row = db.execute(
            "SELECT encrypted FROM credentials WHERE provider=?", (provider,)
        ).fetchone()
    return cipher().decrypt(row[0].encode()).decode() if row else None
