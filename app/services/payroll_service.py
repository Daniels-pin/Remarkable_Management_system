from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import (
    AccountStatus,
    LedgerEntryType,
    RecordLifecycleState,
    SalaryType,
    UserRole,
)
from app.models.financial_month import FinancialMonth
from app.models.ledger import LedgerEntry
from app.models.user import User
from app.services.ledger_service import (
    barber_month_revenue_buckets,
    barber_operational_month_keys,
    operational_months_in_range,
)

_ZERO = Decimal("0")


def expected_month_payout(
    user: User,
    *,
    settled: Decimal,
    commission_pct: Decimal | None = None,
) -> Decimal:
    """Expected payout for a calendar month from reconciled (approved) service value."""
    pct = commission_pct if commission_pct is not None else (user.commission_pct or _ZERO)
    commission_amount = (settled * pct / Decimal("100")) if pct else _ZERO
    if user.salary_type == SalaryType.FIXED and user.fixed_salary is not None:
        return Decimal(user.fixed_salary)
    if user.salary_type == SalaryType.FIXED_OR_COMMISSION and user.fixed_salary is not None:
        return max(Decimal(user.fixed_salary), commission_amount)
    return commission_amount


def barber_all_time_approved_total(db: Session, *, barber_user_id) -> Decimal:
    """Lifetime approved (matched) service revenue across all operational months."""
    total = _ZERO
    for year, month in barber_operational_month_keys(db, barber_user_id=barber_user_id):
        buckets = barber_month_revenue_buckets(
            db, barber_user_id=barber_user_id, year=year, month=month
        )
        total += buckets["approved_total"]
    return total


def barber_all_time_expected_payout(db: Session, *, user: User) -> Decimal:
    """Lifetime expected payout from all historical approved reconciliation totals."""
    total = _ZERO
    pct = user.commission_pct or _ZERO
    month_keys = barber_operational_month_keys(db, barber_user_id=user.id)
    for year, month in month_keys:
        buckets = barber_month_revenue_buckets(db, barber_user_id=user.id, year=year, month=month)
        total += expected_month_payout(user, settled=buckets["approved_total"], commission_pct=pct)

    if total > _ZERO:
        return total

    approved = barber_all_time_approved_total(db, barber_user_id=user.id)
    if approved <= _ZERO:
        return _ZERO

    # Commission barbers: single lifetime approved aggregate when per-month keys were empty.
    if user.salary_type in (None, SalaryType.COMMISSION) or (
        user.salary_type == SalaryType.FIXED_OR_COMMISSION and pct
    ):
        return expected_month_payout(user, settled=approved, commission_pct=pct)

    if user.salary_type == SalaryType.FIXED and user.fixed_salary is not None and month_keys:
        return Decimal(user.fixed_salary) * len(month_keys)

    return expected_month_payout(user, settled=approved, commission_pct=pct)


def _month_member_obligation(db: Session, user: User, *, year: int, month: int) -> Decimal:
    if user.role == UserRole.BARBER:
        buckets = barber_month_revenue_buckets(db, barber_user_id=user.id, year=year, month=month)
        return expected_month_payout(user, settled=buckets["approved_total"])
    if user.role == UserRole.STAFF:
        if user.salary_type in (SalaryType.FIXED, SalaryType.FIXED_OR_COMMISSION) and user.fixed_salary:
            return Decimal(user.fixed_salary)
        buckets = barber_month_revenue_buckets(db, barber_user_id=user.id, year=year, month=month)
        return expected_month_payout(user, settled=buckets["approved_total"])
    return _ZERO


def _team_members_for_payroll_period(
    db: Session, *, months: list[tuple[int, int]]
) -> list[User]:
    """Active barbers/staff plus anyone with service activity in the overlapping months."""
    roles = (UserRole.BARBER, UserRole.STAFF)
    active = (
        db.query(User)
        .filter(User.role.in_(roles), User.account_status == AccountStatus.ACTIVE)
        .all()
    )
    member_ids = {u.id for u in active}

    if months:
        fm_ids: list = []
        for y, m in months:
            fm_ids.extend(
                row[0]
                for row in db.query(FinancialMonth.id)
                .filter(FinancialMonth.year == y, FinancialMonth.month == m)
                .all()
            )
        if fm_ids:
            extra = (
                db.query(LedgerEntry.employee_user_id)
                .filter(
                    LedgerEntry.financial_month_id.in_(fm_ids),
                    LedgerEntry.entry_type == LedgerEntryType.SERVICE,
                    LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
                    LedgerEntry.employee_user_id.isnot(None),
                )
                .distinct()
                .all()
            )
            member_ids.update(row[0] for row in extra)

    if not member_ids:
        return active

    return (
        db.query(User)
        .filter(User.id.in_(member_ids), User.role.in_(roles))
        .all()
    )


def period_team_payroll_obligations(db: Session, *, start: datetime, end: datetime) -> Decimal:
    """
    Commission and salary obligations for barbers/staff in the date range.

    Only months with real posted operational activity contribute — empty calendar
    months never accrue salary or commission.
    """
    months = operational_months_in_range(db, start=start, end=end)
    if not months:
        return _ZERO

    team = _team_members_for_payroll_period(db, months=months)
    if not team:
        return _ZERO

    total = _ZERO
    for year, month in months:
        for user in team:
            total += _month_member_obligation(db, user, year=year, month=month)
    return total
