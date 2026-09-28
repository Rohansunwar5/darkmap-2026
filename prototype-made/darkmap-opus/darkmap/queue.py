'''Durable database-backed job queue.

PostgreSQL: SELECT ... FOR UPDATE SKIP LOCKED.
SQLite: optimistic lease claim (single-writer safe for local development).
'''
import datetime as dt
import socket
from typing import Any, Dict, Optional

from sqlalchemy import and_, or_, select, update
from sqlalchemy.orm import Session

from . import audit
from .db import is_postgres
from .models import Job, utcnow

LEASE_SECONDS = 300


def enqueue(session: Session, kind: str, payload: Dict[str, Any],
            max_attempts: int = 3, delay_seconds: float = 0) -> Job:
    job = Job(kind=kind, payload=payload, max_attempts=max_attempts,
              available_at=utcnow() + dt.timedelta(seconds=delay_seconds))
    session.add(job)
    session.flush()
    audit.record(session, action='queue.enqueue', target=f'{kind}:{job.public_id}',
                 status='queued', detail={'payload_keys': sorted(payload)})
    return job


def claim(session: Session, worker_id: Optional[str] = None) -> Optional[Job]:
    worker_id = worker_id or f'{socket.gethostname()}:{id(session) % 100000}'
    now = utcnow()
    stale = now - dt.timedelta(seconds=LEASE_SECONDS)

    base = select(Job).where(
        or_(Job.status == 'queued',
            and_(Job.status == 'running',
                 or_(Job.locked_at.is_(None), Job.locked_at <= stale))),
        Job.available_at <= now,
    ).order_by(Job.available_at.asc(), Job.id.asc()).limit(1)

    if is_postgres():
        job = session.scalar(base.with_for_update(skip_locked=True))
        if job is None:
            return None
    else:
        job = session.scalar(base)
        if job is None:
            return None
        res = session.execute(
            update(Job).where(Job.id == job.id, Job.status == job.status,
                              Job.locked_at == job.locked_at)
            .values(status='running', locked_at=now, locked_by=worker_id,
                    attempts=Job.attempts + 1, updated_at=now))
        if (res.rowcount or 0) == 0:
            return None
        session.commit()
        return session.get(Job, job.id)

    job.status = 'running'
    job.locked_at = now
    job.locked_by = worker_id
    job.attempts = (job.attempts or 0) + 1
    session.flush()
    session.commit()
    return job


def complete(session: Session, job: Job, result: Dict[str, Any]) -> None:
    if job.status != 'running' or not job.locked_by:
        raise RuntimeError('cannot complete a job without an active worker lease')
    job.status = 'succeeded'
    job.result = result
    job.error = None
    job.locked_at = None
    job.locked_by = None
    job.updated_at = utcnow()
    audit.record(session, action='queue.complete', target=f'{job.kind}:{job.public_id}',
                 status='succeeded', detail={'attempts': job.attempts})
    session.flush()


def fail(session: Session, job: Job, error: str, retry_after: float = 0) -> None:
    if job.status != 'running' or not job.locked_by:
        raise RuntimeError('cannot fail a job without an active worker lease')
    job.error = error[:4000]
    job.locked_at = None
    job.locked_by = None
    job.updated_at = utcnow()
    if (job.attempts or 0) < (job.max_attempts or 3):
        job.status = 'queued'
        backoff = retry_after or min(300, 2 ** (job.attempts or 1))
        job.available_at = utcnow() + dt.timedelta(seconds=backoff)
        status = 'retry_scheduled'
    else:
        job.status = 'failed'
        status = 'failed'
    audit.record(session, action='queue.fail', target=f'{job.kind}:{job.public_id}',
                 status=status, detail={'attempts': job.attempts, 'error': error[:500]})
    session.flush()
