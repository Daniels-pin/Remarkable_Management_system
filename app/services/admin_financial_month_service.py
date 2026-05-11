from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models.enums import FinancialMonthState
from app.models.financial_month import FinancialMonth, MonthReopenEvent
from app.models.user import User
from app.services import audit_service


def admin_reopen_financial_month(
    db: Session,
    *,
    admin: User,
    impersonator_id: uuid.UUID | None,
    financial_month_id: uuid.UUID,
    reason: str,
    ip_address: str | None,
) -> FinancialMonth:
    fm = db.get(FinancialMonth, financial_month_id)
    if fm is None:
        raise NotFoundError("Financial month not found.", code="FINANCIAL_MONTH_NOT_FOUND")

    if fm.state == FinancialMonthState.PAID_LOCKED:
        fm.state = FinancialMonthState.CLOSED
        fm.paid_locked_at = None
        fm.paid_locked_by_user_id = None
    elif fm.state == FinancialMonthState.CLOSED:
        fm.state = FinancialMonthState.OPEN
        fm.closed_at = None
        fm.closed_by_user_id = None
    else:
        raise ValidationAppError(
            "Only a closed or paid-locked month can be reopened with this action.",
            code="MONTH_NOT_REOPENABLE",
        )

    db.add(fm)
    reopen = MonthReopenEvent(
        financial_month_id=fm.id,
        admin_user_id=admin.id,
        reason=reason.strip(),
    )
    db.add(reopen)
    audit_service.write_audit_log(
        db,
        actor_user_id=admin.id,
        impersonator_user_id=impersonator_id,
        action="admin.financial_month_reopen",
        entity_type="financial_month",
        entity_id=str(fm.id),
        message=f"Financial month {fm.year}-{fm.month:02d} reopened (month_reopened)",
        payload={"year": fm.year, "month": fm.month, "new_state": str(fm.state)},
        ip_address=ip_address,
    )
    db.flush()
    return fm
