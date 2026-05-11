from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_actor_context, get_admin_actor, get_db
from app.models.commission import MonthlyCommissionStatement
from app.models.enums import UserRole
from app.models.financial_month import FinancialMonth
from app.schemas.operations import CommissionMarkPaidBody
from app.services import commission_service

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/months")
def list_financial_months(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    if actor.user.role == UserRole.BARBER:
        return {"items": [], "note": "Barbers use /barber/dashboard and commission statements."}
    rows = (
        db.query(FinancialMonth)
        .order_by(FinancialMonth.year.desc(), FinancialMonth.month.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": str(r.id),
                "year": r.year,
                "month": r.month,
                "state": str(r.state),
                "closed_at": r.closed_at.isoformat() if r.closed_at else None,
            }
            for r in rows
        ]
    }


@router.get("/commission-statements")
def list_commission_statements(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    q = db.query(MonthlyCommissionStatement)
    if actor.user.role == UserRole.BARBER:
        q = q.filter(MonthlyCommissionStatement.user_id == actor.user.id)
    elif actor.user.role == UserRole.MANAGER:
        pass
    elif actor.user.role == UserRole.ADMIN:
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
