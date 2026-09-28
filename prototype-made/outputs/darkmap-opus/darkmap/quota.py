'''Per-provider request quotas.

Quotas are a self-imposed ceiling that keeps Darkmap well inside whatever limits a data
source publishes. When a quota is exhausted Darkmap stops and reschedules; it never
rotates identities or otherwise tries to get around a limit.
'''
import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import QuotaCounter, utcnow


class QuotaExceeded(Exception):
    def __init__(self, scope: str, window: str, retry_after: float):
        super().__init__(f'quota exhausted for {scope} ({window}); retry in {retry_after:.0f}s')
        self.scope = scope
        self.window = window
        self.retry_after = retry_after


def _bucket(now: dt.datetime, granularity: str) -> str:
    if granularity == 'minute':
        return 'm:' + now.strftime('%Y%m%d%H%M')
    return 'd:' + now.strftime('%Y%m%d')


def _incr(session: Session, scope: str, window: str, limit: int, retry_after: float) -> None:
    row = session.scalar(select(QuotaCounter).where(
        QuotaCounter.scope == scope, QuotaCounter.window == window).with_for_update(nowait=False)
        if session.bind.dialect.name == 'postgresql' else
        select(QuotaCounter).where(QuotaCounter.scope == scope, QuotaCounter.window == window))
    if row is None:
        row = QuotaCounter(scope=scope, window=window, count=0)
        session.add(row)
        session.flush()
    if row.count >= limit:
        raise QuotaExceeded(scope, window, retry_after)
    row.count += 1
    session.flush()


def consume(session: Session, scope: str, cost: int = 1) -> None:
    '''Consume `cost` units from the minute and day quota for `scope`.'''
    s = get_settings()
    now = utcnow()
    for _ in range(cost):
        _incr(session, scope, _bucket(now, 'minute'), s.quota_per_minute,
              60 - now.second)
        _incr(session, scope, _bucket(now, 'day'), s.quota_per_day, 3600.0)


def usage(session: Session, scope: str) -> dict:
    now = utcnow()
    out = {}
    for gran in ('minute', 'day'):
        w = _bucket(now, gran)
        row = session.scalar(select(QuotaCounter).where(
            QuotaCounter.scope == scope, QuotaCounter.window == w))
        out[gran] = row.count if row else 0
    return out
