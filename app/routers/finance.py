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
from app.services import commission_service, month_lifecycle_service
from app.services.ledger_service import barber_month_revenue_buckets, barber_operational_month_keys
from app.services.payroll_service import expected_month_payout

router = APIRouter(prefix="/finance", tags=["finance"])


def _run_lifecycle(db: Session) -> None:
    month_lifecycle_service.process_lifecycle_transitions(db)


def _is_personal_finance_role(role: UserRole | str) -> bool:
    return str(role) in (UserRole.BARBER, UserRole.STAFF)


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
    if _is_personal_finance_role(actor.user.role):
        return {
            "month": _personal_month_row(
                db,
                user=actor.user,
                year=open_month.year,
                month=open_month.month,
                financial_month=open_month,
                is_current=True,
            )
        }
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

    if _is_personal_finance_role(actor.user.role):
        return _personal_earnings_month_history(db, actor)

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


def _personal_month_row(
    db: Session,
    *,
    user,
    year: int,
    month: int,
    financial_month: FinancialMonth | None,
    is_current: bool,
) -> dict:
    """Single-month personal earnings payload for barbers and staff."""
    stmt = (
        db.query(MonthlyCommissionStatement)
        .filter(
            MonthlyCommissionStatement.user_id == user.id,
            MonthlyCommissionStatement.financial_month_id == financial_month.id,
        )
        .one_or_none()
        if financial_month is not None
        else None
    )
    buckets = barber_month_revenue_buckets(db, barber_user_id=user.id, year=year, month=month)
    approved = buckets["approved_total"]
    if stmt is not None:
        approved = stmt.approved_service_revenue_total
        earnings = stmt.commission_amount
        payout_state = str(stmt.payout_state)
        payout_payment_date = (
            stmt.payout_payment_date.isoformat() if stmt.payout_payment_date else None
        )
        payout_paid_by_label = stmt.payout_paid_by_label
        payout_note = stmt.payout_note
        statement_id = str(stmt.id)
    else:
        earnings = expected_month_payout(user, settled=approved)
        payout_state = "unpaid"
        payout_payment_date = None
        payout_paid_by_label = None
        payout_note = None
        statement_id = None

    inferred_state = "open"
    if financial_month is not None:
        inferred_state = str(financial_month.state)
    else:
        today = month_lifecycle_service.calendar_today()
        if (year, month) < (today.year, today.month):
            inferred_state = "locked"

    return {
        "id": str(financial_month.id) if financial_month else f"{year}-{month:02d}",
        "year": year,
        "month": month,
        "state": inferred_state,
        "is_current": is_current,
        "closed_at": financial_month.closed_at.isoformat()
        if financial_month and financial_month.closed_at
        else None,
        "grace_ends_at": financial_month.grace_ends_at.isoformat()
        if financial_month and financial_month.grace_ends_at
        else None,
        "locked_at": financial_month.paid_locked_at.isoformat()
        if financial_month and financial_month.paid_locked_at
        else None,
        "approved_total": str(approved),
        "earnings_amount": str(earnings),
        "commission_pct_at_close": str(stmt.commission_pct_at_close) if stmt else None,
        "statement_id": statement_id,
        "payout_state": payout_state,
        "payout_payment_date": payout_payment_date,
        "payout_paid_by_label": payout_paid_by_label,
        "payout_note": payout_note,
    }


def _personal_earnings_month_history(db: Session, actor: ActorContext) -> dict:
    user = actor.user
    open_month = month_lifecycle_service.get_open_financial_month(db)
    month_keys: set[tuple[int, int]] = set(
        barber_operational_month_keys(db, barber_user_id=user.id)
    )

    stmt_rows = (
        db.query(MonthlyCommissionStatement, FinancialMonth)
        .join(FinancialMonth, FinancialMonth.id == MonthlyCommissionStatement.financial_month_id)
        .filter(MonthlyCommissionStatement.user_id == user.id)
        .all()
    )
    for _stmt, fm in stmt_rows:
        month_keys.add((fm.year, fm.month))

    items = []
    for year, month in sorted(month_keys, reverse=True):
        fm = month_lifecycle_service.get_financial_month(db, year=year, month=month)
        items.append(
            _personal_month_row(
                db,
                user=user,
                year=year,
                month=month,
                financial_month=fm,
                is_current=open_month is not None
                and fm is not None
                and fm.id == open_month.id,
            )
        )
    return {"items": items, "note": "Your commission and salary statement history."}


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
    if _is_personal_finance_role(actor.user.role):
        q = q.filter(MonthlyCommissionStatement.user_id == actor.user.id)
    elif actor.user.role not in (UserRole.MANAGER, UserRole.ADMIN):
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
