import uuid

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.auth.rbac import assert_no_nested_impersonation, require_admin
from app.auth.session_cookies import set_session_cookie
from app.auth.session_tokens import create_user_session, revoke_session_by_raw_token
from app.core.config import settings
from app.core.deps import ActorContext, get_actor_context, get_db
from app.models.enums import AccountStatus, UserRole
from app.models.user import User
from app.schemas.admin_users import (
    AdminFinancialMonthReopenBody,
    AdminPasswordResetResponse,
    AdminUserCreate,
    AdminUserDetail,
    AdminUserListResponse,
    AdminUserUpdate,
)
from app.schemas.auth import SessionInfoResponse
from app.schemas.common import MessageResponse
from app.schemas.operations import AdminResolveDisputeBody, PurgeLedgerBody
from app.schemas.session import build_session_info_response
from app.services import (
    admin_financial_month_service,
    admin_user_service,
    audit_service,
    ledger_service,
    reconciliation_service,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> AdminUserListResponse:
    require_admin(actor.user)
    items = admin_user_service.list_users_admin(db)
    return AdminUserListResponse(items=items)


@router.post("/users", response_model=AdminUserDetail)
def create_user(
    body: AdminUserCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> AdminUserDetail:
    require_admin(actor.user)
    row = admin_user_service.create_user_admin(db, body=body, admin_id=actor.user.id)
    audit_service.write_audit_log(
        db,
        actor_user_id=actor.user.id,
        impersonator_user_id=actor.impersonator.id if actor.impersonator else None,
        action="admin.user_create",
        entity_type="user",
        entity_id=str(row.id),
        message="User created",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return admin_user_service.get_user_admin(db, row.id)


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> AdminUserDetail:
    require_admin(actor.user)
    return admin_user_service.get_user_admin(db, user_id)


@router.patch("/users/{user_id}", response_model=AdminUserDetail)
def update_user(
    user_id: uuid.UUID,
    body: AdminUserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> AdminUserDetail:
    require_admin(actor.user)
    row = admin_user_service.update_user_admin(
        db, user_id=user_id, body=body, actor_user_id=actor.user.id
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=actor.user.id,
        impersonator_user_id=actor.impersonator.id if actor.impersonator else None,
        action="admin.user_update",
        entity_type="user",
        entity_id=str(user_id),
        message="User updated",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return row


@router.post("/users/{user_id}/deactivate", response_model=AdminUserDetail)
def deactivate_user(
    user_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> AdminUserDetail:
    require_admin(actor.user)
    row = admin_user_service.set_account_status(
        db, user_id=user_id, status=AccountStatus.DISABLED, actor_user_id=actor.user.id
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=actor.user.id,
        impersonator_user_id=actor.impersonator.id if actor.impersonator else None,
        action="admin.user_deactivate",
        entity_type="user",
        entity_id=str(user_id),
        message="User deactivated",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return row


@router.post("/users/{user_id}/reactivate", response_model=AdminUserDetail)
def reactivate_user(
    user_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> AdminUserDetail:
    require_admin(actor.user)
    u = db.get(User, user_id)
    if u and u.username.startswith("purged_"):
        raise HTTPException(
            status_code=400,
            detail={"message": "Purged accounts cannot be reactivated.", "code": "USER_PURGED"},
        )
    row = admin_user_service.set_account_status(
        db, user_id=user_id, status=AccountStatus.ACTIVE, actor_user_id=actor.user.id
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=actor.user.id,
        impersonator_user_id=actor.impersonator.id if actor.impersonator else None,
        action="admin.user_reactivate",
        entity_type="user",
        entity_id=str(user_id),
        message="User reactivated",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return row


@router.post("/users/{user_id}/mark-deleted", response_model=AdminUserDetail)
def mark_user_deleted(
    user_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> AdminUserDetail:
    require_admin(actor.user)
    row = admin_user_service.set_account_status(
        db, user_id=user_id, status=AccountStatus.DELETED, actor_user_id=actor.user.id
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=actor.user.id,
        impersonator_user_id=actor.impersonator.id if actor.impersonator else None,
        action="admin.user_mark_deleted",
        entity_type="user",
        entity_id=str(user_id),
        message="User marked deleted (soft)",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return row


@router.post("/users/{user_id}/purge", response_model=MessageResponse)
def purge_user(
    user_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> MessageResponse:
    require_admin(actor.user)
    admin_user_service.purge_user_record(db, user_id=user_id, actor_user_id=actor.user.id)
    audit_service.write_audit_log(
        db,
        actor_user_id=actor.user.id,
        impersonator_user_id=actor.impersonator.id if actor.impersonator else None,
        action="admin.user_purge",
        entity_type="user",
        entity_id=str(user_id),
        message="User record purged (anonymized)",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return MessageResponse(message="User data has been purged and the account anonymized.")


@router.post("/users/{user_id}/impersonate", response_model=SessionInfoResponse)
def impersonate_user(
    user_id: uuid.UUID,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    raw_token: str | None = Cookie(None, alias=settings.session_cookie_name),
) -> SessionInfoResponse:
    require_admin(actor.user)
    assert_no_nested_impersonation(actor.session_row.impersonator_user_id)

    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail={"message": "User not found"})

    if target.account_status != AccountStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Only active accounts can be impersonated.",
                "code": "IMPERSONATE_INACTIVE",
            },
        )

    admin_user = actor.user
    revoke_session_by_raw_token(db, raw_token)
    session_row, raw = create_user_session(
        db,
        user=target,
        impersonator_user_id=admin_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=admin_user.id,
        impersonator_user_id=None,
        action="admin.impersonate",
        entity_type="user",
        entity_id=str(target.id),
        message="Impersonation session started",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    set_session_cookie(response, value=raw, settings=settings)

    return build_session_info_response(target, session_row, admin_user)


@router.post("/impersonation/stop", response_model=SessionInfoResponse)
def stop_impersonation(
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    raw_token: str | None = Cookie(None, alias=settings.session_cookie_name),
) -> SessionInfoResponse:
    imp_id = actor.session_row.impersonator_user_id
    if imp_id is None:
        raise HTTPException(
            status_code=400,
            detail={"message": "Not in an impersonation session.", "code": "NOT_IMPERSONATING"},
        )
    admin_user = db.get(User, imp_id)
    if admin_user is None or admin_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=400, detail={"message": "Invalid impersonation state."})
    if admin_user.account_status != AccountStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail={"message": "Admin account is not active.", "code": "ADMIN_INACTIVE"},
        )

    revoke_session_by_raw_token(db, raw_token)
    session_row, raw = create_user_session(
        db,
        user=admin_user,
        impersonator_user_id=None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=admin_user.id,
        impersonator_user_id=None,
        action="admin.impersonate_stop",
        entity_type="user",
        entity_id=str(actor.user.id),
        message="Impersonation ended; admin session restored",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    set_session_cookie(response, value=raw, settings=settings)
    return build_session_info_response(admin_user, session_row, None)


@router.post("/users/{user_id}/reset-password", response_model=AdminPasswordResetResponse)
def reset_password(
    user_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> AdminPasswordResetResponse:
    require_admin(actor.user)
    temp = admin_user_service.admin_reset_password(
        db, user_id=user_id, actor_user_id=actor.user.id
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=actor.user.id,
        impersonator_user_id=actor.impersonator.id if actor.impersonator else None,
        action="admin.user_password_reset",
        entity_type="user",
        entity_id=str(user_id),
        message="Admin issued a temporary password",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return AdminPasswordResetResponse(temporary_password=temp)


@router.post("/financial-months/{month_id}/reopen", response_model=dict)
def reopen_financial_month(
    month_id: uuid.UUID,
    body: AdminFinancialMonthReopenBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_admin(actor.user)
    fm = admin_financial_month_service.admin_reopen_financial_month(
        db,
        admin=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        financial_month_id=month_id,
        reason=body.reason,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return {"id": str(fm.id), "year": fm.year, "month": fm.month, "state": str(fm.state)}


@router.post("/reconciliation/disputes/{summary_id}/resolve")
def admin_resolve_dispute(
    summary_id: uuid.UUID,
    body: AdminResolveDisputeBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_admin(actor.user)
    s = reconciliation_service.admin_resolve_daily_dispute(
        db,
        admin=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        summary_id=summary_id,
        final_day_total=body.final_day_total,
        note=body.note,
    )
    db.commit()
    return {"summary_id": str(s.id), "status": str(s.status)}


@router.post("/ledger/{entry_id}/purge", response_model=MessageResponse)
def admin_purge_ledger_entry(
    entry_id: uuid.UUID,
    body: PurgeLedgerBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> MessageResponse:
    require_admin(actor.user)
    ledger_service.purge_entry_admin(
        db,
        admin=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        entry_id=entry_id,
        reason=body.reason,
    )
    db.commit()
    return MessageResponse(message="Entry marked purged; retained for audit with purge metadata.")
