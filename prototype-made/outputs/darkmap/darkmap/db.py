import json
import sqlite3
import time
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS entities (
 id TEXT PRIMARY KEY, brand TEXT NOT NULL, account TEXT NOT NULL, kind TEXT NOT NULL,
 search_text TEXT NOT NULL, payload TEXT NOT NULL, updated REAL NOT NULL);
CREATE INDEX IF NOT EXISTS entity_brand_account ON entities(brand,account);
CREATE INDEX IF NOT EXISTS entity_kind ON entities(kind);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id),
 cache_key TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, available REAL NOT NULL,
 lease_until REAL, lease_token TEXT, result TEXT, error TEXT, created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS job_ready ON jobs(status,available);
CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, result TEXT NOT NULL, expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at REAL NOT NULL, event TEXT NOT NULL, details TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotas (key TEXT PRIMARY KEY, window INTEGER NOT NULL, used INTEGER NOT NULL);
"""

@contextmanager
def connect(path):
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()

def init(path):
    with connect(path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)

def audit(db, event, **details):
    db.execute("INSERT INTO audit(at,event,details) VALUES(?,?,?)", (time.time(), event, json.dumps(details)))

def quota(db, key, amount, limit):
    now = int(time.time() // 3600)
    row = db.execute("SELECT * FROM quotas WHERE key=?", (key,)).fetchone()
    used = row["used"] if row and row["window"] == now else 0
    if used + amount > limit:
        return False
    db.execute("INSERT OR REPLACE INTO quotas VALUES(?,?,?)", (key, now, used + amount))
    return True
