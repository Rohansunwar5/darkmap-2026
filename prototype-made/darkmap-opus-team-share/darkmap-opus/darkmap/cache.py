'''Small durable HTTP response cache backed by the primary database.'''
import datetime as dt
import hashlib
import json
from typing import Any, Dict, Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import HttpCacheEntry, utcnow


def make_key(method: str, url: str, params: Optional[Dict[str, Any]] = None) -> str:
    blob = json.dumps({'m': method.upper(), 'u': url, 'p': params or {}}, sort_keys=True)
    return hashlib.sha256(blob.encode('utf-8')).hexdigest()


def get(session: Session, key: str) -> Optional[HttpCacheEntry]:
    entry = session.scalar(select(HttpCacheEntry).where(HttpCacheEntry.cache_key == key))
    if entry is None:
        return None
    if entry.expires_at and entry.expires_at <= utcnow():
        session.delete(entry)
        session.flush()
        return None
    return entry


def put(session: Session, key: str, status_code: int, body: str,
        headers: Optional[Dict[str, str]] = None, ttl_seconds: int = 900) -> None:
    session.execute(delete(HttpCacheEntry).where(HttpCacheEntry.cache_key == key))
    session.add(HttpCacheEntry(
        cache_key=key, status_code=status_code, body=body, headers=headers or {},
        stored_at=utcnow(), expires_at=utcnow() + dt.timedelta(seconds=ttl_seconds)))
    session.flush()


def purge_expired(session: Session) -> int:
    res = session.execute(delete(HttpCacheEntry).where(HttpCacheEntry.expires_at <= utcnow()))
    return res.rowcount or 0
