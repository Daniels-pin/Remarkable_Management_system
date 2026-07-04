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
from app.services.attendance_service import (
    attendance_start_date_for,
    is_attendance_subject,
    month_deduction_summary,
    process_absences_for_user,
    resolve_attendance_start_date,
)
from app.services.team_advance_service import month_team_advances_total, month_team_advances_summary


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

_ZERO = Decimal("0")


def net_month_payout(
    db: Session,
    user: User,
    *,
    settled: Decimal,
    year: int,
    month: int,
    commission_pct: Decimal | None = None,
) -> Decimal:
    """Expected payout minus attendance and team advance deductions for the month."""
    gross = expected_month_payout(user, settled=settled, commission_pct=commission_pct)
    summary = month_deduction_summary(db, user_id=user.id, year=year, month=month)
    attendance = Decimal(summary["total_deductions"])
    team_advances = month_team_advances_total(db, user_id=user.id, year=year, month=month)
    return max(gross - attendance - team_advances, _ZERO)


def month_payout_breakdown(
    db: Session,
    user: User,
    *,
    year: int,
    month: int,
    settled: Decimal | None = None,
    commission_pct: Decimal | None = None,
    sync_absences: bool = True,
) -> tuple[dict, int]:
    """
    Live expected vs actual payout for a calendar month, including attendance penalties.

    Returns (payload, absences_synced) where absences_synced is the number of new
    absence rows created when sync_absences is True (callers may commit when > 0).
    """
    absences_synced = 0
    if sync_absences:
        absences_synced = process_absences_for_user(db, user)

    activation_backfilled = False
    if is_attendance_subject(user):
        start_before = attendance_start_date_for(user)
        resolve_attendance_start_date(db, user, persist=True)
        activation_backfilled = start_before is None and attendance_start_date_for(user) is not None

    if settled is None:
        buckets = barber_month_revenue_buckets(db, barber_user_id=user.id, year=year, month=month)
        settled = buckets["approved_total"]

    pct = commission_pct if commission_pct is not None else (user.commission_pct or _ZERO)
    expected = expected_month_payout(user, settled=settled, commission_pct=pct)
    attendance_summary = month_deduction_summary(db, user_id=user.id, year=year, month=month)
    attendance_deductions = Decimal(attendance_summary["total_deductions"])
    team_advances_summary = month_team_advances_summary(db, user_id=user.id, year=year, month=month)
    team_advances_total = Decimal(team_advances_summary["total"])
    other_deductions = _ZERO
    total_deductions = attendance_deductions + team_advances_total + other_deductions
    actual = max(expected - total_deductions, _ZERO)

    payload = {
        "expected_payout_on_approved": str(expected),
        "actual_payout_on_approved": str(actual),
        "attendance_deductions_total": attendance_summary["total_deductions"],
        "attendance_late_deductions_total": attendance_summary["late_deductions_total"],
        "attendance_absence_deductions_total": attendance_summary["absence_deductions_total"],
        "team_advances_total": team_advances_summary["total"],
        "team_advance_items": team_advances_summary["items"],
        "other_payroll_deductions_total": str(other_deductions),
        "total_payroll_deductions": str(total_deductions),
    }
    return payload, absences_synced + (1 if activation_backfilled else 0)


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
    """Net payroll obligation for a team member in one month (after attendance penalties)."""
    if user.role not in (UserRole.BARBER, UserRole.STAFF):
        return _ZERO
    buckets = barber_month_revenue_buckets(db, barber_user_id=user.id, year=year, month=month)
    process_absences_for_user(db, user)
    return net_month_payout(db, user, settled=buckets["approved_total"], year=year, month=month)


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
