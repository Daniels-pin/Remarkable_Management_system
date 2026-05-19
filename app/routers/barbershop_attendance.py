from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.rbac import require_admin, require_attendance_participant, require_manager_or_admin
from app.core.deps import ActorContext, get_actor_context, get_db
from app.models.enums import UserRole
from app.schemas.attendance import (
    AttendanceActivateBody,
    AttendanceOffDaysUpdate,
    AttendanceSettingsUpdate,
    AttendanceSignInBody,
)
from app.services import attendance_service
from app.services.business_time import business_date_for_instant, shop_tz
from app.services.payroll_service import month_payout_breakdown

router = APIRouter(prefix="/barbershop/attendance", tags=["barbershop-attendance"])


def _run_absence_sync(db: Session) -> None:
    attendance_service.reconcile_all_attendance(db)


@router.get("/settings")
def get_attendance_settings(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    row = attendance_service.get_settings(db)
    payload = attendance_service.serialize_settings(row)
    payload["can_edit"] = actor.user.role == UserRole.ADMIN
    return {"settings": payload}


@router.put("/settings")
def update_attendance_settings(
    body: AttendanceSettingsUpdate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_admin(actor.user)
    row = attendance_service.update_settings(
        db,
        actor=actor.user,
        latitude=body.latitude,
        longitude=body.longitude,
        location_label=body.location_label,
        radius_meters=body.radius_meters,
        late_time=body.late_time,
        late_deduction_amount=body.late_deduction_amount,
        absence_deduction_amount=body.absence_deduction_amount,
    )
    db.commit()
    db.refresh(row)
    return {"settings": attendance_service.serialize_settings(row)}


@router.get("/today")
def get_today_attendance(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    if actor.user.role == UserRole.ADMIN:
        return {
            "exempt": True,
            "message": "Admin accounts do not participate in attendance.",
        }
    _run_absence_sync(db)
    db.commit()
    ctx = attendance_service.today_context(db, actor.user)
    return ctx


@router.post("/sign-in")
def attendance_sign_in(
    body: AttendanceSignInBody,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_attendance_participant(actor.user)
    now = datetime.now(shop_tz())
    row = attendance_service.sign_in(
        db,
        user=actor.user,
        latitude=body.latitude,
        longitude=body.longitude,
        now=now,
    )
    db.commit()
    db.refresh(row)
    today = business_date_for_instant(now)
    payout, _ = month_payout_breakdown(
        db,
        actor.user,
        year=today.year,
        month=today.month,
        sync_absences=False,
    )
    return {
        "message": "Signed in successfully.",
        "record": attendance_service.serialize_record(row),
        "payout": payout,
    }


@router.get("/me")
def my_attendance_history(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    year: int | None = Query(None),
    month: int | None = Query(None, ge=1, le=12),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
) -> dict:
    require_attendance_participant(actor.user)
    _run_absence_sync(db)
    db.commit()
    now = datetime.now(shop_tz())
    y = year or now.year
    m = month or now.month
    rows, total = attendance_service.list_records(
        db,
        user_id=actor.user.id,
        year=y,
        month=m,
        page=page,
        page_size=page_size,
    )
    summary = attendance_service.month_deduction_summary(
        db, user_id=actor.user.id, year=y, month=m
    )
    return {
        "year": y,
        "month": m,
        "page": page,
        "page_size": page_size,
        "total": total,
        "summary": summary,
        "items": [attendance_service.serialize_record(r) for r in rows],
    }


@router.get("/team")
def attendance_team_roster(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_manager_or_admin(actor.user)
    roster = attendance_service.list_attendance_roster(db)
    now = datetime.now(shop_tz())
    from app.services.business_time import business_date_for_instant

    today = business_date_for_instant(now)
    items = []
    for u in roster:
        record = attendance_service.get_record_for_date(db, user_id=u.id, business_date=today)
        config = attendance_service.serialize_user_attendance_config(u)
        items.append(
            {
                "id": str(u.id),
                "username": u.username,
                "full_name": u.profile.full_name if u.profile else None,
                "role": str(u.role),
                "attendance_off_days": config["attendance_off_days"],
                "attendance_start_date": config["attendance_start_date"],
                "today_status": str(record.status) if record else None,
                "today_signed_in_at": record.signed_in_at.isoformat() if record and record.signed_in_at else None,
            }
        )
    return {"items": items}


@router.get("/users/{user_id}")
def user_attendance_history(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    year: int | None = Query(None),
    month: int | None = Query(None, ge=1, le=12),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
) -> dict:
    target = attendance_service.get_attendance_user(db, user_id)
    if actor.user.id != target.id and actor.user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        from app.core.exceptions import ForbiddenError

        raise ForbiddenError("Insufficient permissions", code="FORBIDDEN")
    _run_absence_sync(db)
    db.commit()
    now = datetime.now(shop_tz())
    y = year or now.year
    m = month or now.month
    rows, total = attendance_service.list_records(
        db,
        user_id=target.id,
        year=y,
        month=m,
        page=page,
        page_size=page_size,
    )
    summary = attendance_service.month_deduction_summary(db, user_id=target.id, year=y, month=m)
    config = attendance_service.serialize_user_attendance_config(target)
    return {
        "user": {
            "id": str(target.id),
            "username": target.username,
            "full_name": target.profile.full_name if target.profile else None,
            "role": str(target.role),
            **config,
        },
        "year": y,
        "month": m,
        "page": page,
        "page_size": page_size,
        "total": total,
        "summary": summary,
        "items": [attendance_service.serialize_record(r) for r in rows],
    }


@router.patch("/users/{user_id}/off-days")
def update_user_attendance_off_days(
    user_id: uuid.UUID,
    body: AttendanceOffDaysUpdate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_admin(actor.user)
    target = attendance_service.get_attendance_user(db, user_id)
    attendance_service.update_user_off_days(
        db,
        user=target,
        off_days=body.off_days,
        attendance_start_date=body.attendance_start_date,
    )
    db.commit()
    db.refresh(target)
    config = attendance_service.serialize_user_attendance_config(target)
    return {
        "user_id": str(target.id),
        **config,
    }


@router.post("/users/{user_id}/activate")
def activate_user_attendance_tracking(
    user_id: uuid.UUID,
    body: AttendanceActivateBody,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_admin(actor.user)
    target = attendance_service.get_attendance_user(db, user_id)
    attendance_service.activate_user_attendance(
        db,
        user=target,
        start_date=body.attendance_start_date,
    )
    db.commit()
    db.refresh(target)
    config = attendance_service.serialize_user_attendance_config(target)
    return {"user_id": str(target.id), **config}
