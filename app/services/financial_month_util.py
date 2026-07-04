"""Financial month lookup, lifecycle gates, and write permissions."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, ValidationAppError
from app.models.enums import FinancialMonthState, UserRole
from app.models.financial_month import FinancialMonth
from app.models.user import User
from app.services import month_lifecycle_service


def get_financial_month_for_calendar_date(db: Session, d: date) -> FinancialMonth | None:
    return month_lifecycle_service.get_financial_month(db, year=d.year, month=d.month)


def get_financial_month_by_id(db: Session, financial_month_id: uuid.UUID) -> FinancialMonth | None:
    return db.get(FinancialMonth, financial_month_id)


def _sync_lifecycle(db: Session) -> None:
    month_lifecycle_service.process_lifecycle_transitions(db)


def get_active_open_month(db: Session) -> FinancialMonth | None:
    _sync_lifecycle(db)
    return month_lifecycle_service.get_open_financial_month(db)


def require_financial_month_for_new_entry(
    db: Session,
    business_date: date,
    actor: User | None = None,
) -> FinancialMonth:
    """New operational lines must target the single active open calendar month."""
    _sync_lifecycle(db)
    active = month_lifecycle_service.get_open_financial_month(db)
    if active is None:
        raise ValidationAppError(
            "No active operational month is open. Contact an administrator.",
            code="FINANCIAL_MONTH_MISSING",
        )
    if (business_date.year, business_date.month) != (active.year, active.month):
        raise ValidationAppError(
            "New entries must be recorded in the current operational month only.",
            code="FINANCIAL_MONTH_NOT_ACTIVE",
        )
    if active.state != FinancialMonthState.OPEN:
        raise ValidationAppError(
            "The operational month is not open for new entries.",
            code="FINANCIAL_MONTH_NOT_OPEN",
        )
    return active


def require_open_financial_month(db: Session, d: date) -> FinancialMonth:
    """Backward-compatible alias for new-entry month resolution."""
    return require_financial_month_for_new_entry(db, d)


def assert_month_allows_write(
    db: Session,
    fm: FinancialMonth,
    actor: User,
    *,
    grace_operational: bool = False,
) -> None:
    """Enforce role-based write rules for an existing financial month."""
    if fm.state == FinancialMonthState.OPEN:
        active = month_lifecycle_service.get_open_financial_month(db)
        if active and fm.id != active.id:
            raise ValidationAppError(
                "Only the current operational month accepts changes.",
                code="FINANCIAL_MONTH_NOT_ACTIVE",
            )
        return

    if fm.state == FinancialMonthState.GRACE_PERIOD:
        if actor.role == UserRole.ADMIN:
            return
        if actor.role == UserRole.MANAGER and grace_operational:
            return
        raise ForbiddenError(
            "This month is in grace period. Only managers and admins may adjust records.",
            code="FINANCIAL_MONTH_GRACE_READONLY",
        )

    if fm.state == FinancialMonthState.LOCKED:
        raise ValidationAppError(
            "This financial month is locked and cannot be modified.",
            code="FINANCIAL_MONTH_LOCKED",
        )


def require_writable_month_for_entry(
    db: Session,
    *,
    financial_month_id: uuid.UUID,
    actor: User,
    grace_operational: bool = False,
) -> FinancialMonth:
    _sync_lifecycle(db)
    fm = get_financial_month_by_id(db, financial_month_id)
    if fm is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Financial month not found.", code="FINANCIAL_MONTH_NOT_FOUND")
    assert_month_allows_write(db, fm, actor, grace_operational=grace_operational)
    return fm


def require_grace_or_open_month_for_reconciliation(
    db: Session,
    business_day: date,
    actor: User,
) -> FinancialMonth:
    """Reconciliation writes: open month always; grace month for manager/admin."""
    _sync_lifecycle(db)
    fm = get_financial_month_for_calendar_date(db, business_day)
    if fm is None:
        raise ValidationAppError(
            "No financial month exists for this calendar month.",
            code="FINANCIAL_MONTH_MISSING",
        )
    if fm.state == FinancialMonthState.OPEN:
        active = month_lifecycle_service.get_open_financial_month(db)
        if active and fm.id == active.id:
            return fm
    assert_month_allows_write(db, fm, actor, grace_operational=True)
    return fm


def month_permissions_payload(
    fm: FinancialMonth | None,
    *,
    is_current_open: bool,
    actor: User,
) -> dict[str, bool | str | None]:
    """API flags for month-scoped operational UI."""
    from app.services.grace_period_service import grace_correction_allowed, month_history_read_only

    state = str(fm.state) if fm else "locked"
    grace_editable = grace_correction_allowed(fm, actor) if fm is not None else False
    return {
        "month_state": state,
        "grace_period_editable": grace_editable,
        "read_only": month_history_read_only(fm, is_current_open=is_current_open, actor=actor),
    }
