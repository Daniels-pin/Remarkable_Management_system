"""Minimal in-app notifications."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.app_notification import AppNotification
from app.models.enums import AppNotificationType, UserRole
from app.models.user import User


def notify_user(
    db: Session,
    *,
    user_id: uuid.UUID,
    notification_type: AppNotificationType,
    title: str,
    body: str | None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> AppNotification:
    row = AppNotification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload,
    )
    db.add(row)
    return row


def notify_role_users(
    db: Session,
    *,
    roles: set[UserRole],
    notification_type: AppNotificationType,
    title: str,
    body: str | None,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> None:
    users = db.query(User).filter(User.role.in_(roles)).all()
    for u in users:
        notify_user(
            db,
            user_id=u.id,
            notification_type=notification_type,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
        )


def resolve_by_entity(db: Session, *, entity_type: str, entity_id: str) -> None:
    now = datetime.now(UTC)
    (
        db.query(AppNotification)
        .filter(
            AppNotification.entity_type == entity_type,
            AppNotification.entity_id == entity_id,
            AppNotification.resolved_at.is_(None),
        )
        .update({AppNotification.resolved_at: now}, synchronize_session=False)
    )


def list_active_for_user(db: Session, *, user_id: uuid.UUID) -> list[AppNotification]:
    return (
        db.query(AppNotification)
        .filter(AppNotification.user_id == user_id, AppNotification.resolved_at.is_(None))
        .order_by(AppNotification.created_at.desc())
        .limit(100)
        .all()
    )
