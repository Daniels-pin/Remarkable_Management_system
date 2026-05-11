from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from app.core.deps import ActorContext, get_actor_context, get_db
from app.models.barber_daily_summary import BarberDailySummary
from app.models.enums import AccountStatus, LedgerEntryType, RecordLifecycleState, UserRole
from app.models.ledger import LedgerEntry
from app.models.user import User
from app.services.business_time import shop_tz
from app.services.ledger_service import barber_month_gross_recorded, barber_month_revenue_buckets

router = APIRouter(prefix="/barbershop/directory", tags=["barbershop"])


@router.get("/barbers")
def list_barbers(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    """
    Lightweight directory view for UI pickers and roster cards.

    - Barbers may only see themselves (so the Barbers page can still route to their profile).
    - Managers/admin/staff may see the full active roster.
    """
    if actor.user.role == UserRole.BARBER:
        u = (
            db.query(User)
            .options(joinedload(User.profile))
            .filter(User.id == actor.user.id)
            .one()
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
            ]
        }

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


def _require_can_view_barber(actor: ActorContext, barber_id: uuid.UUID) -> None:
    if actor.user.role == UserRole.BARBER and actor.user.id != barber_id:
        # barbers may only see their own directory details
        raise HTTPException(status_code=403, detail={"message": "Forbidden", "code": "FORBIDDEN"})


@router.get("/barbers/{barber_user_id}")
def get_barber(
    barber_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_can_view_barber(actor, barber_user_id)
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
    _require_can_view_barber(actor, barber_user_id)
    now = datetime.now(shop_tz())
    y, m = (year or now.year), (month or now.month)
    u = db.get(User, barber_user_id)
    if u is None:
        return {"found": False}
    buckets = barber_month_revenue_buckets(db, barber_user_id=barber_user_id, year=y, month=m)
    gross = barber_month_gross_recorded(db, barber_user_id=barber_user_id, year=y, month=m)
    pct = u.commission_pct or 0
    settled = buckets["settled_total"]
    expected_payout = (settled * pct / 100) if pct else 0
    return {
        "found": True,
        "year": y,
        "month": m,
        "commission_pct": str(pct),
        "current_month_gross_recorded": str(gross),
        "pending_total": str(buckets["pending_total"]),
        "awaiting_review_total": str(buckets["awaiting_review_total"]),
        "adjusted_or_approved_total": str(buckets["adjusted_or_approved_total"]),
        "settled_total": str(buckets["settled_total"]),
        "disputed_total": str(buckets["disputed_total"]),
        "expected_payout_on_settled": str(expected_payout),
    }


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
    _require_can_view_barber(actor, barber_user_id)
    q = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.employee_user_id == barber_user_id,
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


@router.get("/barbers/{barber_user_id}/reconciliations")
def barber_reconciliation_history(
    barber_user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> dict:
    _require_can_view_barber(actor, barber_user_id)
    q = (
        db.query(BarberDailySummary)
        .filter(BarberDailySummary.barber_user_id == barber_user_id)
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

