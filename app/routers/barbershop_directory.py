from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from app.core.deps import ActorContext, get_actor_context, get_db
from app.models.barber_daily_summary import BarberDailySummary
from app.services.payroll_service import (
    barber_all_time_approved_total,
    barber_all_time_expected_payout,
    month_payout_breakdown,
)
from app.models.enums import (
    AccountStatus,
    LedgerEntryType,
    RecordLifecycleState,
    UserRole,
)
from app.models.catalog import ServiceType
from app.models.ledger import LedgerEntry
from app.models.user import User
from app.services.business_time import shop_tz
from app.services import month_lifecycle_service
from app.services import ledger_service
from app.services.ledger_service import (
    barber_all_time_gross_recorded,
    barber_all_time_services_count,
    barber_month_gross_recorded,
    barber_month_revenue_buckets,
    barber_month_services_count,
)

router = APIRouter(prefix="/barbershop/directory", tags=["barbershop"])

_TEAM_ROLES = (UserRole.BARBER, UserRole.STAFF)


def _require_management(actor: ActorContext) -> None:
    if actor.user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(
            status_code=403,
            detail={"message": "Forbidden", "code": "FORBIDDEN"},
        )


def _serialize_team_member(u: User, *, include_payroll: bool = True) -> dict:
    base = {
        "id": str(u.id),
        "username": u.username,
        "email": u.email,
        "role": str(u.role),
        "full_name": u.profile.full_name if u.profile else None,
    }
    if not include_payroll:
        return base
    base.update(
        {
            "commission_pct": str(u.commission_pct) if u.commission_pct is not None else None,
            "fixed_salary": str(u.fixed_salary) if u.fixed_salary is not None else None,
            "salary_type": str(u.salary_type) if u.salary_type else None,
        }
    )
    return base


def _posture_label(buckets: dict) -> str:
    if buckets.get("mismatch_indexes"):
        return "mismatch"
    if buckets["pending_total"] > 0:
        return "pending"
    if buckets["approved_total"] > 0:
        return "approved"
    return "clear"


def _month_stats_payload(
    db: Session, u: User, *, year: int, month: int, include_payroll: bool = True
) -> tuple[dict, int]:
    buckets = barber_month_revenue_buckets(db, barber_user_id=u.id, year=year, month=month)
    gross = barber_month_gross_recorded(db, barber_user_id=u.id, year=year, month=month)
    services_count = barber_month_services_count(db, barber_user_id=u.id, year=year, month=month)
    all_time_gross = barber_all_time_gross_recorded(db, barber_user_id=u.id)
    all_time_services = barber_all_time_services_count(db, barber_user_id=u.id)
    all_time_approved = barber_all_time_approved_total(db, barber_user_id=u.id)
    all_time_payout = barber_all_time_expected_payout(db, user=u)
    pct = u.commission_pct or Decimal(0)
    approved = buckets["approved_total"]
    payload = {
        "found": True,
        "year": year,
        "month": month,
        "role": str(u.role),
        "current_month_gross_recorded": str(gross),
        "current_month_services_count": services_count,
        "pending_total": str(buckets["pending_total"]),
        "approved_total": str(buckets["approved_total"]),
        "mismatch_indexes": buckets["mismatch_indexes"],
        "reconciliation_posture": _posture_label(buckets),
    }
    absences_synced = 0
    if include_payroll:
        payout, absences_synced = month_payout_breakdown(
            db, u, year=year, month=month, settled=approved, commission_pct=pct
        )
        payload.update(
            {
                "commission_pct": str(pct),
                "fixed_salary": str(u.fixed_salary) if u.fixed_salary is not None else None,
                "salary_type": str(u.salary_type) if u.salary_type else None,
                "all_time_gross_recorded": str(all_time_gross),
                "all_time_services_count": all_time_services,
                "all_time_approved_total": str(all_time_approved),
                "all_time_commission_total": str(all_time_payout),
                **payout,
            }
        )
    return payload, absences_synced


def _get_team_member(db: Session, user_id: uuid.UUID) -> User | None:
    return (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(
            User.id == user_id,
            User.role.in_(_TEAM_ROLES),
            User.account_status == AccountStatus.ACTIVE,
        )
        .one_or_none()
    )


@router.get("/team")
def list_team(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    role: str | None = Query(None, description="Filter: barber, staff, or omit for all"),
) -> dict:
    """Active barbers and staff with current-month performance snapshots."""
    _require_management(actor)
    now = datetime.now(shop_tz())
    y, m = now.year, now.month

    q = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(
            User.role.in_(_TEAM_ROLES),
            User.account_status == AccountStatus.ACTIVE,
        )
        .order_by(User.role.asc(), User.username.asc())
    )
    if role == "barber":
        q = q.filter(User.role == UserRole.BARBER)
    elif role == "staff":
        q = q.filter(User.role == UserRole.STAFF)

    items = []
    absences_synced = 0
    for u in q.all():
        buckets = barber_month_revenue_buckets(db, barber_user_id=u.id, year=y, month=m)
        gross = barber_month_gross_recorded(db, barber_user_id=u.id, year=y, month=m)
        services = barber_month_services_count(db, barber_user_id=u.id, year=y, month=m)
        pct = u.commission_pct or Decimal(0)
        include_payroll = actor.user.role == UserRole.ADMIN
        base = _serialize_team_member(u, include_payroll=include_payroll)
        base.update(
            {
                "current_month_revenue": str(gross),
                "current_month_services_count": services,
                "reconciliation_posture": _posture_label(buckets),
            }
        )
        if include_payroll:
            payout, synced = month_payout_breakdown(
                db,
                u,
                year=y,
                month=m,
                settled=buckets["approved_total"],
                commission_pct=pct,
            )
            absences_synced += synced
            base["expected_payout"] = payout["expected_payout_on_approved"]
            base["actual_payout"] = payout["actual_payout_on_approved"]
            base["attendance_deductions_total"] = payout["attendance_deductions_total"]
        items.append(base)

    if absences_synced:
        db.commit()

    return {"items": items, "year": y, "month": m}


@router.get("/team/{member_user_id}")
def get_team_member(
    member_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_management(actor)
    u = _get_team_member(db, member_user_id)
    if u is None:
        return {"found": False}
    include_payroll = actor.user.role == UserRole.ADMIN
    detail = _serialize_team_member(u, include_payroll=include_payroll)
    detail["phone"] = u.profile.phone if u.profile else None
    if include_payroll:
        detail.update(
            {
                "bank_name": u.profile.bank_name if u.profile else None,
                "account_number": u.profile.account_number if u.profile else None,
                "account_name": u.profile.account_name if u.profile else None,
            }
        )
    return {"found": True, "member": detail}


@router.get("/team/{member_user_id}/month-stats")
def team_member_month_stats(
    member_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    year: int | None = None,
    month: int | None = None,
) -> dict:
    _require_management(actor)
    now = datetime.now(shop_tz())
    y, m = (year or now.year), (month or now.month)
    u = _get_team_member(db, member_user_id)
    if u is None:
        return {"found": False}
    include_payroll = actor.user.role == UserRole.ADMIN
    payload, absences_synced = _month_stats_payload(
        db, u, year=y, month=m, include_payroll=include_payroll
    )
    if absences_synced:
        db.commit()
    return payload


@router.get("/team/{member_user_id}/ledger")
def team_member_ledger(
    member_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    year: int | None = None,
    month: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> dict:
    _require_management(actor)
    if _get_team_member(db, member_user_id) is None:
        raise HTTPException(status_code=404, detail={"message": "Not found", "code": "NOT_FOUND"})
    return _ledger_page(db, member_user_id, year=year, month=month, page=page, page_size=page_size)


@router.get("/team/{member_user_id}/reconciliations")
def team_member_reconciliation_history(
    member_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> dict:
    _require_management(actor)
    if _get_team_member(db, member_user_id) is None:
        raise HTTPException(status_code=404, detail={"message": "Not found", "code": "NOT_FOUND"})
    return _reconciliations_page(db, member_user_id, page=page, page_size=page_size)


def _service_type_names(db: Session, rows: list[LedgerEntry]) -> dict[uuid.UUID, str]:
    ids = {r.service_type_id for r in rows if r.service_type_id}
    if not ids:
        return {}
    return {
        row.id: row.name
        for row in db.query(ServiceType).filter(ServiceType.id.in_(ids)).all()
    }




@router.get("/team/{member_user_id}/reconciliation-months")
def team_member_operational_months(
    member_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_management(actor)
    if _get_team_member(db, member_user_id) is None:
        raise HTTPException(status_code=404, detail={"message": "Not found", "code": "NOT_FOUND"})
    open_month = month_lifecycle_service.get_open_financial_month(db)
    open_key = (open_month.year, open_month.month) if open_month else None
    items = []
    for year, month in ledger_service.barber_operational_month_keys(
        db, barber_user_id=member_user_id
    ):
        fm = month_lifecycle_service.get_financial_month(db, year=year, month=month)
        items.append(
            {
                "year": year,
                "month": month,
                "state": str(fm.state) if fm else "locked",
                "is_current": open_key == (year, month),
            }
        )
    return {"items": items}


@router.get("/team/{member_user_id}/reconciliation-history")
def team_member_reconciliation_history(
    member_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    year: int | None = None,
    month: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=50),
) -> dict:
    """Paginated indexed reconciliation history for a team member calendar month."""
    _require_management(actor)
    if _get_team_member(db, member_user_id) is None:
        raise HTTPException(status_code=404, detail={"message": "Not found", "code": "NOT_FOUND"})

    now = datetime.now(shop_tz())
    y, m = year or now.year, month or now.month
    items, total = ledger_service.list_barber_month_reconciliation(
        db,
        barber_user_id=member_user_id,
        year=y,
        month=m,
        page=page,
        page_size=page_size,
    )
    open_month = month_lifecycle_service.get_open_financial_month(db)
    is_current = open_month is not None and (y, m) == (open_month.year, open_month.month)
    return {
        "year": y,
        "month": m,
        "is_current_month": is_current,
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": items,
    }


@router.get("/team/{member_user_id}/reconciliation-workspace")
def team_member_reconciliation_workspace(
    member_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    business_date: date | None = Query(None, alias="date"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=20),
) -> dict:
    """Indexed side-by-side employee vs manager service lines for a single business day."""
    _require_management(actor)
    if _get_team_member(db, member_user_id) is None:
        raise HTTPException(status_code=404, detail={"message": "Not found", "code": "NOT_FOUND"})

    day = business_date or datetime.now(shop_tz()).date()
    items, total = ledger_service.list_barber_day_reconciliation(
        db,
        barber_user_id=member_user_id,
        business_day=day,
        page=page,
        page_size=page_size,
    )
    summary = (
        db.query(BarberDailySummary)
        .filter(
            BarberDailySummary.barber_user_id == member_user_id,
            BarberDailySummary.business_date == day,
        )
        .one_or_none()
    )
    return {
        "business_date": day.isoformat(),
        "page": page,
        "page_size": page_size,
        "total": total,
        "daily_summary_status": str(summary.status) if summary else None,
        "items": items,
    }


def _ledger_page(
    db: Session,
    employee_user_id: uuid.UUID,
    *,
    year: int | None,
    month: int | None,
    page: int,
    page_size: int,
) -> dict:
    q = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.employee_user_id == employee_user_id,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
        )
        .order_by(LedgerEntry.occurred_at.desc())
    )
    if year is not None:
        q = q.filter(extract("year", LedgerEntry.business_date) == year)
    if month is not None:
        q = q.filter(extract("month", LedgerEntry.business_date) == month)
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            {
                "id": str(r.id),
                "barber_sequence_index": r.barber_sequence_index,
                "occurred_at": r.occurred_at.isoformat(),
                "business_date": r.business_date.isoformat() if r.business_date else None,
                "service_type_id": str(r.service_type_id) if r.service_type_id else None,
                "amount": str(r.amount),
                "original_barber_amount": str(r.original_barber_amount)
                if r.original_barber_amount is not None
                else None,
                "manager_approved_amount": str(r.manager_approved_amount)
                if r.manager_approved_amount is not None
                else None,
                "reconciliation_status": str(r.reconciliation_status)
                if r.reconciliation_status
                else None,
                "payment_method": str(r.payment_method) if r.payment_method else None,
                "note": r.note,
            }
            for r in rows
        ],
    }


def _reconciliations_page(
    db: Session,
    employee_user_id: uuid.UUID,
    *,
    page: int,
    page_size: int,
) -> dict:
    q = (
        db.query(BarberDailySummary)
        .filter(BarberDailySummary.barber_user_id == employee_user_id)
        .order_by(BarberDailySummary.business_date.desc())
    )
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            {
                "id": str(r.id),
                "business_date": r.business_date.isoformat(),
                "status": str(r.status),
                "manager_proposal_version": r.manager_proposal_version,
                "total_original_barber": str(r.total_original_barber),
                "total_manager_approved": str(r.total_manager_approved),
                "used_manager_entries_due_to_missing_barber": r.used_manager_entries_due_to_missing_barber,
                "barber_rejection_reason": r.barber_rejection_reason,
                "settled_at": r.settled_at.isoformat() if r.settled_at else None,
                "admin_resolved_at": r.admin_resolved_at.isoformat() if r.admin_resolved_at else None,
                "admin_final_day_total": str(r.admin_final_day_total)
                if r.admin_final_day_total is not None
                else None,
            }
            for r in rows
        ],
    }


# Legacy barber-only endpoints (kept for existing clients)


@router.get("/barbers")
def list_barbers(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_management(actor)
    rows = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(
            User.role == UserRole.BARBER,
            User.account_status == AccountStatus.ACTIVE,
        )
        .order_by(User.username.asc())
        .all()
    )
    return {
        "items": [
            {
                "id": str(u.id),
                "username": u.username,
                "email": u.email,
                "full_name": u.profile.full_name if u.profile else None,
                "commission_pct": str(u.commission_pct) if u.commission_pct is not None else None,
                "salary_type": str(u.salary_type) if u.salary_type else None,
            }
            for u in rows
        ]
    }


@router.get("/barbers/{barber_user_id}")
def get_barber(
    barber_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_management(actor)
    u = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(User.id == barber_user_id, User.role == UserRole.BARBER)
        .one_or_none()
    )
    if u is None:
        return {"found": False}
    return {
        "found": True,
        "barber": {
            "id": str(u.id),
            "username": u.username,
            "email": u.email,
            "full_name": u.profile.full_name if u.profile else None,
            "phone": u.profile.phone if u.profile else None,
            "bank_name": u.profile.bank_name if u.profile else None,
            "account_number": u.profile.account_number if u.profile else None,
            "account_name": u.profile.account_name if u.profile else None,
            "commission_pct": str(u.commission_pct) if u.commission_pct is not None else None,
            "salary_type": str(u.salary_type) if u.salary_type else None,
        },
    }


@router.get("/barbers/{barber_user_id}/month-stats")
def barber_month_stats(
    barber_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    year: int | None = None,
    month: int | None = None,
) -> dict:
    _require_management(actor)
    now = datetime.now(shop_tz())
    y, m = (year or now.year), (month or now.month)
    u = db.get(User, barber_user_id)
    if u is None or u.role != UserRole.BARBER:
        return {"found": False}
    payload, absences_synced = _month_stats_payload(db, u, year=y, month=m)
    if absences_synced:
        db.commit()
    return payload


@router.get("/barbers/{barber_user_id}/ledger")
def barber_ledger(
    barber_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    year: int | None = None,
    month: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> dict:
    _require_management(actor)
    return _ledger_page(
        db, barber_user_id, year=year, month=month, page=page, page_size=page_size
    )


@router.get("/barbers/{barber_user_id}/reconciliations")
def barber_reconciliation_history(
    barber_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> dict:
    _require_management(actor)
    return _reconciliations_page(db, barber_user_id, page=page, page_size=page_size)
