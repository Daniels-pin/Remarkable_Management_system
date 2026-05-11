from __future__ import annotations

from datetime import UTC, datetime

from app.models.user import User, UserSession
from app.schemas.auth import SessionInfoResponse


def build_session_info_response(
    user: User,
    session_row: UserSession,
    impersonator: User | None,
) -> SessionInfoResponse:
    now = datetime.now(UTC)
    seconds = max(0, int((session_row.expires_at - now).total_seconds()))
    return SessionInfoResponse(
        user_id=user.id,
        role=user.role,
        must_change_password=user.must_change_password,
        expires_at=session_row.expires_at,
        seconds_until_expiry=seconds,
        impersonating=impersonator is not None,
        impersonator_user_id=impersonator.id if impersonator else None,
    )
