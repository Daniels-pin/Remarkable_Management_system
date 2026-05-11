from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Cookie, Depends, Request
from sqlalchemy.orm import Session

from app.auth.session_tokens import get_session_by_raw_token, touch_session
from app.core.config import settings
from app.core.exceptions import unauthorized
from app.database.session import get_db
from app.models.enums import AccountStatus
from app.models.user import User, UserSession


@dataclass(frozen=True)
class ActorContext:
    user: User
    impersonator: User | None
    session_row: UserSession

    @property
    def is_impersonating(self) -> bool:
        return self.impersonator is not None


def get_actor_context(
    request: Request,
    db: Session = Depends(get_db),
    raw_token: str | None = Cookie(None, alias=settings.session_cookie_name),
) -> ActorContext:
    if not raw_token:
        raise unauthorized("Missing session", code="NO_SESSION")

    sess = get_session_by_raw_token(db, raw_token)
    now = datetime.now(UTC)
    if sess is None or sess.expires_at < now:
        raise unauthorized("Session expired or invalid", code="SESSION_INVALID")

    user = db.get(User, sess.user_id)
    if user is None or user.account_status != AccountStatus.ACTIVE:
        raise unauthorized("Account inactive", code="ACCOUNT_INACTIVE")

    impersonator: User | None = None
    if sess.impersonator_user_id is not None:
        impersonator = db.get(User, sess.impersonator_user_id)

    touch_session(db, sess)
    db.commit()

    return ActorContext(user=user, impersonator=impersonator, session_row=sess)


def get_actor_context_optional(
    request: Request,
    db: Session = Depends(get_db),
    raw_token: str | None = Cookie(None, alias=settings.session_cookie_name),
) -> ActorContext | None:
    if not raw_token:
        return None

    sess = get_session_by_raw_token(db, raw_token)
    now = datetime.now(UTC)
    if sess is None or sess.expires_at < now:
        return None

    user = db.get(User, sess.user_id)
    if user is None or user.account_status != AccountStatus.ACTIVE:
        return None

    impersonator: User | None = None
    if sess.impersonator_user_id is not None:
        impersonator = db.get(User, sess.impersonator_user_id)

    touch_session(db, sess)
    db.commit()

    return ActorContext(user=user, impersonator=impersonator, session_row=sess)
