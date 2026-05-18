from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session, joinedload

from app.auth.rbac import require_barbershop_finance, require_manager_or_admin
from app.core.deps import ActorContext, get_actor_context, get_admin_actor, get_db
from app.models.commission import MonthlyCommissionStatement
from app.models.enums import UserRole
from app.models.financial_month import FinancialMonth
from app.schemas.financial_month import FinancialMonthCloseBody
from app.schemas.operations import CommissionMarkPaidBody
from app.services import commission_service, month_lifecycle_service, operations_analytics_service

router = APIRouter(prefix="/finance", tags=["finance"])


def _run_lifecycle(db: Session) -> None:
    month_lifecycle_service.process_lifecycle_transitions(db)


@router.get("/months/current")
def get_current_financial_month(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_barbershop_finance(actor.user)
    _run_lifecycle(db)
    open_month = month_lifecycle_service.get_open_financial_month(db)
    if open_month is None:
        return {"month": None}
    return {
        "month": month_lifecycle_service.serialize_month_row(
            db, open_month, role=actor.user.role, is_current=True
        )
    }


@router.get("/months")
def list_financial_months(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_barbershop_finance(actor.user)
    _run_lifecycle(db)

    if actor.user.role == UserRole.BARBER:
        return _barber_month_history(db, actor)

    require_manager_or_admin(actor.user)
    open_month = month_lifecycle_service.get_open_financial_month(db)
    rows = (
        db.query(FinancialMonth)
        .options(joinedload(FinancialMonth.snapshot))
        .order_by(FinancialMonth.year.desc(), FinancialMonth.month.desc())
        .all()
    )
    items = [
        month_lifecycle_service.serialize_month_row(
            db,
            r,
            role=actor.user.role,
            is_current=open_month is not None and r.id == open_month.id,
        )
        for r in rows
    ]
    return {"items": items}


def _barber_month_history(db: Session, actor: ActorContext) -> dict:
    from sqlalchemy import extract

    from app.models.enums import LedgerEntryType, RecordLifecycleState
    from app.models.ledger import LedgerEntry

    pairs = (
        db.query(
            extract("year", LedgerEntry.business_date),
            extract("month", LedgerEntry.business_date),
        )
        .filter(
            LedgerEntry.employee_user_id == actor.user.id,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            LedgerEntry.business_date.isnot(None),
        )
        .distinct()
        .order_by(
            extract("year", LedgerEntry.business_date).desc(),
            extract("month", LedgerEntry.business_date).desc(),
        )
        .all()
    )
    items = []
    open_month = month_lifecycle_service.get_open_financial_month(db)
    for year_raw, month_raw in pairs:
        year, month = int(year_raw), int(month_raw)
        fm = month_lifecycle_service.get_financial_month(db, year=year, month=month)
        summary = operations_analytics_service.barber_month_summary(
            db, barber_user_id=actor.user.id, year=year, month=month
        )
        today = month_lifecycle_service.calendar_today()
        inferred_state = "open"
        if fm is not None:
            inferred_state = str(fm.state)
        elif (year, month) < (today.year, today.month):
            inferred_state = "locked"

        items.append(
            {
                **summary,
                "id": str(fm.id) if fm else f"{year}-{month:02d}",
                "state": inferred_state,
                "is_current": open_month is not None
                and fm is not None
                and fm.id == open_month.id,
                "closed_at": fm.closed_at.isoformat() if fm and fm.closed_at else None,
                "grace_ends_at": fm.grace_ends_at.isoformat() if fm and fm.grace_ends_at else None,
                "locked_at": fm.paid_locked_at.isoformat() if fm and fm.paid_locked_at else None,
            }
        )
    return {"items": items, "note": "Your historical monthly service records."}


@router.post("/months/{month_id}/close")
def close_financial_month(
    month_id: UUID,
    body: FinancialMonthCloseBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_manager_or_admin(actor.user)
    fm = month_lifecycle_service.manual_close_month(
        db,
        actor=actor.user,
        financial_month_id=month_id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(fm)
    return month_lifecycle_service.serialize_month_row(
        db, fm, role=actor.user.role, is_current=False
    )


@router.get("/commission-statements")
def list_commission_statements(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    require_barbershop_finance(actor.user)
    q = db.query(MonthlyCommissionStatement)
    if actor.user.role == UserRole.BARBER:
        q = q.filter(MonthlyCommissionStatement.user_id == actor.user.id)
    elif actor.user.role in (UserRole.MANAGER, UserRole.ADMIN):
        pass
    else:
        return {"items": [], "note": "No finance visibility for this role."}
    rows = q.order_by(MonthlyCommissionStatement.calculated_at.desc()).limit(500).all()
    return {
        "items": [
            {
                "id": str(r.id),
                "financial_month_id": str(r.financial_month_id),
                "user_id": str(r.user_id),
                "approved_service_revenue_total": str(r.approved_service_revenue_total),
                "commission_pct_at_close": str(r.commission_pct_at_close),
                "commission_amount": str(r.commission_amount),
                "status": r.status,
                "payout_state": str(r.payout_state),
                "payout_marked_at": r.payout_marked_at.isoformat() if r.payout_marked_at else None,
                "payout_payment_date": r.payout_payment_date.isoformat()
                if r.payout_payment_date
                else None,
                "payout_paid_by_label": r.payout_paid_by_label,
                "payout_note": r.payout_note,
            }
            for r in rows
        ]
    }


@router.post("/commission-statements/{statement_id}/mark-paid")
def mark_commission_paid(
    statement_id: UUID,
    body: CommissionMarkPaidBody,
    request: Request,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = commission_service.mark_statement_paid(
        db,
        admin=actor.user,
        impersonator_id=actor.impersonator.id if actor.impersonator else None,
        ip_address=request.client.host if request.client else None,
        statement_id=statement_id,
        payment_date=body.payment_date,
        paid_by_label=body.paid_by_label,
        note=body.note,
    )
    db.commit()
    db.refresh(row)
    return {"id": str(row.id), "payout_state": str(row.payout_state)}
