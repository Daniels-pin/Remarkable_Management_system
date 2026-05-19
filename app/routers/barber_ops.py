from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_service_provider_actor, get_db
from app.models.catalog import ServiceType
from app.services.payroll_service import (
    barber_all_time_approved_total,
    barber_all_time_expected_payout,
    expected_month_payout,
)
from app.models.reconciliation_timeline import ReconciliationTimelineEvent
from app.models.user import User
from app.schemas.operations import (
    BarberRejectBody,
    BarberServiceCreateBody,
    BarberServiceUpdateBody,
)
from app.services import ledger_service, month_lifecycle_service, reconciliation_service
from app.services.business_time import shop_tz

router = APIRouter(prefix="/barber", tags=["barber"])


def _service_type_names(db: Session, rows: list) -> dict:
    ids = {r.service_type_id for r in rows if r.service_type_id}
    if not ids:
        return {}
    return {
        row.id: row.name
        for row in db.query(ServiceType).filter(ServiceType.id.in_(ids)).all()
    }


def _indexed_reconciliation_row(
    db: Session,
    e,
    *,
    service_name: str | None = None,
) -> dict:
    """Serialize a single service ledger row after create/update."""
    label = service_name or "Service"
    employee, manager = ledger_service.paired_rows_for_service(db, e)
    comparison = ledger_service.comparison_status_for_service_row(db, e) or "waiting_for_reconciliation"
    return {
        "id": str(e.id),
        "index": e.barber_sequence_index,
        "barber_sequence_index": e.barber_sequence_index,
        "index_label": f"#{e.barber_sequence_index:03d}" if e.barber_sequence_index else None,
        "occurred_at": e.occurred_at.isoformat(),
        "business_date": e.business_date.isoformat() if e.business_date else None,
        "service_type_id": str(e.service_type_id) if e.service_type_id else None,
        "service_name": label,
        "amount": str(e.amount),
        "employee_amount": str(employee.amount) if employee else None,
        "manager_amount": str(manager.amount) if manager else None,
        "comparison_status": comparison,
        "reconciliation_status": str(e.reconciliation_status) if e.reconciliation_status else None,
        "is_manager_created_without_barber": employee is None and manager is not None,
        "payment_method": str(e.payment_method) if e.payment_method else None,
        "note": e.note,
        "record_stream": str(e.record_stream) if e.record_stream else None,
    }


def _ledger_row(db: Session, e) -> dict:
    return _indexed_reconciliation_row(db, e)


@router.get("/dashboard")
def barber_dashboard(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_service_provider_actor),
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
    services_count = ledger_service.barber_month_services_count(
        db, barber_user_id=user.id, year=y, month=m
    )
    all_time_gross = ledger_service.barber_all_time_gross_recorded(db, barber_user_id=user.id)
    all_time_services = ledger_service.barber_all_time_services_count(db, barber_user_id=user.id)
    all_time_approved = barber_all_time_approved_total(db, barber_user_id=user.id)
    all_time_payout = barber_all_time_expected_payout(db, user=user)
    pct = user.commission_pct or Decimal("0")
    approved = buckets["approved_total"]
    expected_payout = expected_month_payout(user, settled=approved, commission_pct=pct)
    return {
        "year": y,
        "month": m,
        "commission_pct": str(pct),
        "current_month_gross_recorded": str(gross),
        "current_month_services_count": services_count,
        "all_time_gross_recorded": str(all_time_gross),
        "all_time_services_count": all_time_services,
        "all_time_approved_total": str(all_time_approved),
        "all_time_commission_total": str(all_time_payout),
        "pending_total": str(buckets["pending_total"]),
        "approved_total": str(buckets["approved_total"]),
        "mismatch_indexes": buckets["mismatch_indexes"],
        "expected_payout_on_approved": str(expected_payout),
        "used_shop_timezone": str(shop_tz()),
    }


@router.get("/ledger/day")
def barber_day_ledger(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_service_provider_actor),
    business_date: date = Query(..., description="Business day in YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
) -> dict:
    items, total = ledger_service.list_barber_day_reconciliation(
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
        "items": items,
    }


@router.get("/reconciliation/workspace")
def barber_reconciliation_workspace(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_service_provider_actor),
    business_date: date = Query(..., description="Business day in YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> dict:
    """Indexed side-by-side employee vs manager lines for the provider daily ledger."""
    items, total = ledger_service.list_barber_day_reconciliation(
        db,
        barber_user_id=actor.user.id,
        business_day=business_date,
        page=page,
        page_size=page_size,
    )
    summary = reconciliation_service.get_or_create_daily_summary(
        db, barber_user_id=actor.user.id, business_day=business_date
    )
    return {
        "business_date": business_date.isoformat(),
        "page": page,
        "page_size": page_size,
        "total": total,
        "daily_summary_status": str(summary.status),
        "items": items,
    }


@router.get("/reconciliation/months")
def barber_operational_months(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_service_provider_actor),
) -> dict:
    """Calendar months with indexed service history for month picker archives."""
    open_month = month_lifecycle_service.get_open_financial_month(db)
    open_key = (open_month.year, open_month.month) if open_month else None
    items = []
    for year, month in ledger_service.barber_operational_month_keys(
        db, barber_user_id=actor.user.id
    ):
        fm = month_lifecycle_service.get_financial_month(db, year=year, month=month)
        state = str(fm.state) if fm else "locked"
        items.append(
            {
                "year": year,
                "month": month,
                "state": state,
                "is_current": open_key == (year, month),
            }
        )
    return {"items": items}


@router.get("/reconciliation/history")
def barber_reconciliation_history(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_service_provider_actor),
    year: int | None = None,
    month: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=50),
) -> dict:
    """Paginated indexed operational history for a calendar month."""
    now = datetime.now(shop_tz())
    y, m = year or now.year, month or now.month
    items, total = ledger_service.list_barber_month_reconciliation(
        db,
        barber_user_id=actor.user.id,
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
        "read_only": not is_current,
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": items,
    }


@router.post("/ledger/service")
def barber_create_service(
    body: BarberServiceCreateBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_service_provider_actor),
) -> dict:
    row = ledger_service.create_barber_service_entry(
        db,
        actor=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        occurred_at=body.occurred_at,
        service_type_id=body.service_type_id,
        amount=body.amount,
        note=body.note,
    )
    db.commit()
    db.refresh(row)
    return _ledger_row(db, row)


@router.patch("/ledger/service/{entry_id}")
def barber_update_service(
    entry_id: UUID,
    body: BarberServiceUpdateBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_service_provider_actor),
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
    )
    db.commit()
    db.refresh(row)
    return _ledger_row(db, row)


@router.delete("/ledger/service/{entry_id}")
def barber_delete_service(
    entry_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_service_provider_actor),
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
    actor: ActorContext = Depends(get_service_provider_actor),
) -> dict:
    summary = reconciliation_service.get_or_create_daily_summary(
        db, barber_user_id=actor.user.id, business_day=business_day
    )
    issues = ledger_service.compute_index_reconciliation_issues(
        db, barber_user_id=actor.user.id, business_day=business_day
    )
    entries, _ = ledger_service.list_barber_day_reconciliation(
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
        "entries": entries,
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
    actor: ActorContext = Depends(get_service_provider_actor),
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
    actor: ActorContext = Depends(get_service_provider_actor),
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
