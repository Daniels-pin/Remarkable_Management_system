from fastapi import Response

from app.core.config import Settings


def set_session_cookie(response: Response, *, value: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=value,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        max_age=settings.session_idle_minutes * 60,
    )


def clear_session_cookie(response: Response, *, settings: Settings) -> None:
    response.delete_cookie(
        settings.session_cookie_name,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )
