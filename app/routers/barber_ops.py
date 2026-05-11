from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_barber_actor, get_db
from app.models.reconciliation_timeline import ReconciliationTimelineEvent
from app.models.user import User
from app.schemas.operations import (
    BarberRejectBody,
    BarberServiceCreateBody,
    BarberServiceUpdateBody,
)
from app.services import ledger_service, reconciliation_service
from app.services.business_time import shop_tz

router = APIRouter(prefix="/barber", tags=["barber"])


def _ledger_row(e) -> dict:
    orig = e.original_barber_amount
    mgr = e.manager_approved_amount
    return {
        "id": str(e.id),
        "barber_sequence_index": e.barber_sequence_index,
        "occurred_at": e.occurred_at.isoformat(),
        "business_date": e.business_date.isoformat() if e.business_date else None,
        "service_type_id": str(e.service_type_id) if e.service_type_id else None,
        "amount": str(e.amount),
        "original_barber_amount": str(orig) if orig is not None else None,
        "manager_approved_amount": str(mgr) if mgr is not None else None,
        "reconciliation_status": str(e.reconciliation_status) if e.reconciliation_status else None,
        "is_manager_created_without_barber": e.is_manager_created_without_barber,
        "payment_method": str(e.payment_method) if e.payment_method else None,
        "note": e.note,
    }


@router.get("/dashboard")
def barber_dashboard(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_barber_actor),
    year: int | None = None,
    month: int | None = None,
) -> dict:
    user: User = actor.user
    now = datetime.now(shop_tz())
    y, m = (year or now.year), (month or now.month)
    buckets = ledger_service.barber_month_revenue_buckets(
        db, barber_user_id=user.id, year=y, month=m
    )
    gross = ledger_service.barber_month_gross_recorded(db, barber_user_id=user.id, year=y, month=m)
    pct = user.commission_pct or Decimal("0")
    settled = buckets["settled_total"]
    expected_payout = (settled * pct / Decimal("100")).quantize(Decimal("0.01"))
    return {
        "year": y,
        "month": m,
        "commission_pct": str(pct),
        "current_month_gross_recorded": str(gross),
        "pending_total": str(buckets["pending_total"]),
        "awaiting_review_total": str(buckets["awaiting_review_total"]),
        "adjusted_or_approved_total": str(buckets["adjusted_or_approved_total"]),
        "approved_totals": str(buckets["awaiting_review_total"] + buckets["settled_total"]),
        "settled_total": str(buckets["settled_total"]),
        "expected_payout_on_settled": str(expected_payout),
        "disputed_total": str(buckets["disputed_total"]),
        "used_shop_timezone": str(shop_tz()),
    }


@router.get("/ledger/day")
def barber_day_ledger(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_barber_actor),
    business_date: date = Query(..., description="Business day in YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
) -> dict:
    rows, total = ledger_service.list_barber_day_entries(
        db,
        barber_user_id=actor.user.id,
        business_day=business_date,
        page=page,
        page_size=page_size,
    )
    return {
        "business_date": business_date.isoformat(),
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [_ledger_row(r) for r in rows],
    }


@router.post("/ledger/service")
def barber_create_service(
    body: BarberServiceCreateBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_barber_actor),
) -> dict:
    row = ledger_service.create_barber_service_entry(
        db,
        actor=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        occurred_at=body.occurred_at,
        service_type_id=body.service_type_id,
        amount=body.amount,
        payment_method=body.payment_method,
        note=body.note,
    )
    db.commit()
    db.refresh(row)
    return _ledger_row(row)


@router.patch("/ledger/service/{entry_id}")
def barber_update_service(
    entry_id: UUID,
    body: BarberServiceUpdateBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_barber_actor),
) -> dict:
    row = ledger_service.update_barber_service_entry(
        db,
        actor=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        entry_id=entry_id,
        amount=body.amount,
        service_type_id=body.service_type_id,
        note=body.note,
        payment_method=body.payment_method,
    )
    db.commit()
    db.refresh(row)
    return _ledger_row(row)


@router.delete("/ledger/service/{entry_id}")
def barber_delete_service(
    entry_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_barber_actor),
) -> dict:
    ledger_service.soft_delete_barber_entry(
        db,
        actor=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        entry_id=entry_id,
    )
    db.commit()
    return {"ok": True}


@router.get("/reconciliation/day/{business_day}")
def barber_reconciliation_day(
    business_day: date,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_barber_actor),
) -> dict:
    summary = reconciliation_service.get_or_create_daily_summary(
        db, barber_user_id=actor.user.id, business_day=business_day
    )
    issues = ledger_service.compute_index_reconciliation_issues(
        db, barber_user_id=actor.user.id, business_day=business_day
    )
    entries, _ = ledger_service.list_barber_day_entries(
        db, barber_user_id=actor.user.id, business_day=business_day, page=1, page_size=500
    )
    timeline = (
        db.query(ReconciliationTimelineEvent)
        .filter(ReconciliationTimelineEvent.summary_id == summary.id)
        .order_by(ReconciliationTimelineEvent.created_at.asc())
        .all()
    )
    mgr_missing_flag = summary.used_manager_entries_due_to_missing_barber
    return {
        "summary": {
            "id": str(summary.id),
            "status": str(summary.status),
            "manager_proposal_version": summary.manager_proposal_version,
            "total_original_barber": str(summary.total_original_barber),
            "total_manager_approved": str(summary.total_manager_approved),
            "used_manager_entries_due_to_missing_barber": mgr_missing_flag,
            "barber_rejection_reason": summary.barber_rejection_reason,
            "admin_final_day_total": str(summary.admin_final_day_total)
            if summary.admin_final_day_total is not None
            else None,
        },
        "entries": [_ledger_row(e) for e in entries],
        "issues": issues,
        "timeline": [
            {
                "event_type": str(t.event_type),
                "message": t.message,
                "created_at": t.created_at.isoformat(),
                "payload": t.payload,
            }
            for t in timeline
        ],
    }


@router.post("/reconciliation/day/{business_day}/accept")
def barber_accept(
    business_day: date,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_barber_actor),
) -> dict:
    s = reconciliation_service.barber_accept_summary(
        db,
        barber=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        business_day=business_day,
    )
    db.commit()
    return {"summary_id": str(s.id), "status": str(s.status)}


@router.post("/reconciliation/day/{business_day}/reject")
def barber_reject(
    business_day: date,
    body: BarberRejectBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_barber_actor),
) -> dict:
    s = reconciliation_service.barber_reject_summary(
        db,
        barber=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        business_day=business_day,
        reason=body.reason,
    )
    db.commit()
    return {"summary_id": str(s.id), "status": str(s.status)}
