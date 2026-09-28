'''Audit logging helpers (append-only).'''
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from .models import AuditLog


def record(session: Session, *, action: str, provider: Optional[str] = None,
           target: Optional[str] = None, status: Optional[str] = None,
           lawful_basis: Optional[str] = None, duration_ms: Optional[int] = None,
           actor: str = 'system', detail: Optional[Dict[str, Any]] = None) -> AuditLog:
    entry = AuditLog(action=action, provider=provider, target=(target or '')[:400],
                     status=status, lawful_basis=lawful_basis, duration_ms=duration_ms,
                     actor=actor, detail=detail or {})
    session.add(entry)
    session.flush()
    return entry
