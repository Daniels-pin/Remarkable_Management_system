from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def write_audit_log(
    db: Session,
    *,
    actor_user_id: uuid.UUID | None,
    impersonator_user_id: uuid.UUID | None,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    message: str | None = None,
    payload: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    row = AuditLog(
        actor_user_id=actor_user_id,
        impersonator_user_id=impersonator_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        message=message,
        payload=payload,
        ip_address=ip_address,
    )
    db.add(row)
    return row
