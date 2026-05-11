"""Financial month lookup / creation for ledger dating."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models.enums import FinancialMonthState
from app.models.financial_month import FinancialMonth


def get_financial_month_for_calendar_date(db: Session, d: date) -> FinancialMonth | None:
    return (
        db.query(FinancialMonth)
        .filter(FinancialMonth.year == d.year, FinancialMonth.month == d.month)
        .one_or_none()
    )


def require_open_financial_month(db: Session, d: date) -> FinancialMonth:
    row = get_financial_month_for_calendar_date(db, d)
    if row is None:
        from app.core.exceptions import ValidationAppError

        raise ValidationAppError(
            "No financial month exists for this calendar month. Ask admin to open the month.",
            code="FINANCIAL_MONTH_MISSING",
        )
    if row.state == FinancialMonthState.PAID_LOCKED:
        from app.core.exceptions import ValidationAppError

        raise ValidationAppError(
            "This financial month is paid and locked.",
            code="FINANCIAL_MONTH_PAID_LOCKED",
        )
    return row
