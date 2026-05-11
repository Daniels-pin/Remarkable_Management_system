from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.password import hash_password, verify_password
from app.auth.session_tokens import create_user_session, revoke_session_by_raw_token
from app.core.config import settings
from app.core.deps import ActorContext, get_actor_context, get_db
from app.models.enums import AccountStatus
from app.schemas.auth import ChangePasswordRequest, LoginRequest, SessionInfoResponse
from app.schemas.common import MessageResponse
from app.schemas.session import build_session_info_response
from app.services import audit_service, user_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=SessionInfoResponse)
def login(
    body: LoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
) -> SessionInfoResponse:
    user = user_service.get_user_by_username_or_email(db, body.username_or_email)
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "Invalid credentials", "code": "INVALID_CREDENTIALS"},
        )
    if user.account_status != AccountStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message": "This account is not active.",
                "code": "ACCOUNT_INACTIVE",
            },
        )

    session_row, raw = create_user_session(
        db,
        user=user,
        impersonator_user_id=None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    response.set_cookie(
        key=settings.session_cookie_name,
        value=raw,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        max_age=settings.session_idle_minutes * 60,
    )

    return build_session_info_response(user, session_row, None)


@router.post("/logout", response_model=MessageResponse)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    raw_token: str | None = Cookie(None, alias=settings.session_cookie_name),
) -> MessageResponse:
    revoke_session_by_raw_token(db, raw_token)
    db.commit()
    response.delete_cookie(settings.session_cookie_name)
    return MessageResponse(message="Logged out")


@router.get("/session", response_model=SessionInfoResponse)
def session_info(actor: ActorContext = Depends(get_actor_context)) -> SessionInfoResponse:
    return build_session_info_response(actor.user, actor.session_row, actor.impersonator)


@router.post("/password", response_model=MessageResponse)
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> MessageResponse:
    if not verify_password(body.current_password, actor.user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Current password is incorrect", "code": "BAD_PASSWORD"},
        )
    actor.user.password_hash = hash_password(body.new_password)
    actor.user.must_change_password = False
    db.add(actor.user)

    if actor.is_impersonating and actor.impersonator:
        msg = "Performed by Admin in Impersonation Mode: password changed for impersonated user"
        audit_service.write_audit_log(
            db,
            actor_user_id=actor.user.id,
            impersonator_user_id=actor.impersonator.id,
            action="user.password_change",
            entity_type="user",
            entity_id=str(actor.user.id),
            message=msg,
        )
    else:
        audit_service.write_audit_log(
            db,
            actor_user_id=actor.user.id,
            impersonator_user_id=None,
            action="user.password_change",
            entity_type="user",
            entity_id=str(actor.user.id),
            message="Password changed",
        )

    db.commit()
    return MessageResponse(message="Password updated")
