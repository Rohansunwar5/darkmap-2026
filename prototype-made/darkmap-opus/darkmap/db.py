'''Database engine/session helpers. PostgreSQL in production, SQLite locally.'''
from contextlib import contextmanager
import os
from typing import Iterator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_SessionLocal = None


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        url = get_settings().database_url
        kwargs = {'future': True, 'pool_pre_ping': True}
        if url.startswith('sqlite'):
            kwargs['connect_args'] = {'check_same_thread': False, 'timeout': 30}
            kwargs.pop('pool_pre_ping')
        _engine = create_engine(url, **kwargs)
        if url.startswith('sqlite'):
            @event.listens_for(_engine, 'connect')
            def _pragma(dbapi_conn, _rec):  # pragma: no cover - trivial
                cur = dbapi_conn.cursor()
                # Changing journal mode acquires an exclusive SQLite lock. On Vercel several
                # short-lived requests can open connections together when the dashboard loads,
                # so repeating that change can make a live search fail before collection starts.
                # Local development retains WAL; serverless uses the configured busy timeout.
                if not os.getenv('VERCEL'):
                    cur.execute('PRAGMA journal_mode=WAL')
                cur.execute('PRAGMA busy_timeout=30000')
                cur.execute('PRAGMA foreign_keys=ON')
                cur.close()
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False,
                                     class_=Session, future=True)
    return _engine


def get_sessionmaker():
    get_engine()
    return _SessionLocal


def reset_engine() -> None:
    '''Used by tests after changing DARKMAP_DATABASE_URL.'''
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def is_postgres() -> bool:
    return get_engine().dialect.name == 'postgresql'


@contextmanager
def session_scope() -> Iterator[Session]:
    sm = get_sessionmaker()
    s = sm()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def get_db() -> Iterator[Session]:
    '''FastAPI dependency.'''
    sm = get_sessionmaker()
    s = sm()
    try:
        yield s
    finally:
        s.close()


def init_db() -> None:
    from . import models  # noqa: F401  (register metadata)
    Base.metadata.create_all(bind=get_engine())
    # Lightweight additive migrations keep existing local/hosted databases compatible without
    # introducing a migration service for this first release.
    engine = get_engine()
    existing = {column['name'] for column in inspect(engine).get_columns('risk_assessments')}
    additions = {
        'dimensions': "JSON DEFAULT '{}'",
        'alert_families': "JSON DEFAULT '{}'",
        'independent_indicators': 'INTEGER DEFAULT 0',
    }
    with engine.begin() as connection:
        for name, sql_type in additions.items():
            if name not in existing:
                connection.execute(text(
                    f'ALTER TABLE risk_assessments ADD COLUMN {name} {sql_type}'))
