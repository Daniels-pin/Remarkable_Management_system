from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User, UserSession


def hash_session_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def new_raw_session_token() -> str:
    return secrets.token_urlsafe(48)


def create_user_session(
    db: Session,
    *,
    user: User,
    impersonator_user_id: uuid.UUID | None,
    ip_address: str | None,
    user_agent: str | None,
) -> tuple[UserSession, str]:
    raw = new_raw_session_token()
    now = datetime.now(UTC)
    idle = timedelta(minutes=settings.session_idle_minutes)
    expires = now + idle

    row = UserSession(
        user_id=user.id,
        impersonator_user_id=impersonator_user_id,
        token_hash=hash_session_token(raw),
        expires_at=expires,
        last_activity_at=now,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(row)
    db.flush()
    return row, raw


def get_session_by_raw_token(db: Session, raw_token: str) -> UserSession | None:
    h = hash_session_token(raw_token)
    return db.query(UserSession).filter(UserSession.token_hash == h).one_or_none()


def revoke_session_by_raw_token(db: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    sess = get_session_by_raw_token(db, raw_token)
    if sess is not None:
        db.delete(sess)


def touch_session(db: Session, session_row: UserSession) -> None:
    now = datetime.now(UTC)
    session_row.last_activity_at = now
    idle = timedelta(minutes=settings.session_idle_minutes)
    session_row.expires_at = now + idle
    db.add(session_row)
