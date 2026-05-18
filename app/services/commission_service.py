from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.commission import MonthlyCommissionStatement
from app.models.enums import CommissionPayoutState, FinancialMonthState, UserRole
from app.models.financial_month import FinancialMonth
from app.models.user import User
from app.services import audit_service


def mark_statement_paid(
    db: Session,
    *,
    admin: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    statement_id: uuid.UUID,
    payment_date: datetime,
    paid_by_label: str,
    note: str | None,
) -> MonthlyCommissionStatement:
    if admin.role != UserRole.ADMIN:
        raise ForbiddenError("Only admins can mark commission paid.", code="ADMIN_ONLY")
    row = db.get(MonthlyCommissionStatement, statement_id)
    if row is None:
        raise NotFoundError("Statement not found.", code="COMMISSION_NOT_FOUND")
    fm = db.get(FinancialMonth, row.financial_month_id)
    if fm is not None and fm.state == FinancialMonthState.LOCKED:
        from app.core.exceptions import ValidationAppError

        raise ValidationAppError(
            "Payouts cannot be modified while the month is locked.",
            code="FINANCIAL_MONTH_LOCKED",
        )
    row.payout_state = CommissionPayoutState.PAID
    row.payout_marked_at = datetime.now(UTC)
    row.payout_marked_by_user_id = admin.id
    row.payout_payment_date = payment_date
    row.payout_paid_by_label = paid_by_label
    row.payout_note = note
    db.add(row)
    audit_service.write_audit_log(
        db,
        actor_user_id=admin.id,
        impersonator_user_id=impersonator_id,
        action="finance.commission_mark_paid",
        entity_type="monthly_commission_statement",
        entity_id=str(row.id),
        message="Commission marked paid",
        ip_address=ip_address,
    )
    return row
