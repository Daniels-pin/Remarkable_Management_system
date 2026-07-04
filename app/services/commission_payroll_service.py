from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.attendance import AttendanceRecord
from app.models.commission import MonthlyCommissionStatement
from app.models.enums import AccountStatus, SalaryType, UserRole
from app.models.user import User
from app.services.attendance_service import month_deduction_summary, serialize_waiver_entry
from app.services.ledger_service import barber_month_revenue_buckets
from app.services.payroll_service import (
    _team_members_for_payroll_period,
    month_payout_breakdown,
)

_ZERO = Decimal("0")


def earns_commission(user: User) -> bool:
    if user.role not in (UserRole.BARBER, UserRole.STAFF):
        return False
    salary_type = user.salary_type
    if salary_type == SalaryType.FIXED:
        return False
    if salary_type == SalaryType.COMMISSION:
        return True
    if salary_type == SalaryType.FIXED_OR_COMMISSION:
        return (user.commission_pct or _ZERO) > _ZERO
    return user.role == UserRole.BARBER


def earns_salary(user: User) -> bool:
    if user.role not in (UserRole.BARBER, UserRole.STAFF):
        return False
    if earns_commission(user):
        return False
    return user.salary_type == SalaryType.FIXED and user.fixed_salary is not None


def _statement_for_month(
    db: Session, *, financial_month_id, user_id
) -> MonthlyCommissionStatement | None:
    if financial_month_id is None:
        return None
    return (
        db.query(MonthlyCommissionStatement)
        .filter(
            MonthlyCommissionStatement.financial_month_id == financial_month_id,
            MonthlyCommissionStatement.user_id == user_id,
        )
        .one_or_none()
    )


def _member_display_name(user: User) -> str:
    if user.profile and user.profile.full_name:
        return user.profile.full_name
    return user.username


def month_salary_obligations(db: Session, *, year: int, month: int) -> Decimal:
    """Fixed salary obligations for staff/barbers on fixed pay in one month."""
    items = _salary_payroll_rows(db, year=year, month=month)
    return sum((Decimal(i["final_salary_payable"]) for i in items), _ZERO)


def _salary_payroll_rows(db: Session, *, year: int, month: int) -> list[dict]:
    months = [(year, month)]
    team = _team_members_for_payroll_period(db, months=months)
    salary_members = [u for u in team if earns_salary(u) and u.account_status == AccountStatus.ACTIVE]
    salary_members.sort(key=lambda u: (_member_display_name(u).lower(), u.username.lower()))
    return [
        salary_payroll_row(db, user, year=year, month=month)
        for user in salary_members
    ]


def _month_waivers_for_user(
    db: Session, *, user_id, year: int, month: int
) -> list[dict]:
    start = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end = date(year, month, last_day)
    rows = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == user_id,
            AttendanceRecord.business_date >= start,
            AttendanceRecord.business_date <= end,
            AttendanceRecord.waived_at.isnot(None),
        )
        .order_by(AttendanceRecord.business_date.asc())
        .all()
    )
    return [serialize_waiver_entry(row) for row in rows]


def commission_payroll_row(
    db: Session,
    user: User,
    *,
    year: int,
    month: int,
    financial_month_id,
) -> dict:
    buckets = barber_month_revenue_buckets(db, barber_user_id=user.id, year=year, month=month)
    stmt = _statement_for_month(db, financial_month_id=financial_month_id, user_id=user.id)

    if stmt is not None:
        approved = stmt.approved_service_revenue_total
        commission_pct = stmt.commission_pct_at_close
        expected_commission = stmt.commission_amount
        payout_state = str(stmt.payout_state)
        statement_id = str(stmt.id)
        status = stmt.status or payout_state
    else:
        approved = buckets["approved_total"]
        commission_pct = user.commission_pct or _ZERO
        expected_commission = (
            (approved * commission_pct / Decimal("100")) if commission_pct else _ZERO
        )
        payout_state = "unpaid"
        statement_id = None
        if buckets.get("mismatch_indexes"):
            status = "mismatch"
        elif buckets["pending_total"] > _ZERO:
            status = "pending"
        elif approved > _ZERO:
            status = "approved"
        else:
            status = "clear"

    payout, _ = month_payout_breakdown(
        db,
        user,
        year=year,
        month=month,
        settled=approved,
        commission_pct=commission_pct,
        sync_absences=False,
    )
    late = Decimal(payout["attendance_late_deductions_total"])
    absence = Decimal(payout["attendance_absence_deductions_total"])
    attendance_total = Decimal(payout["attendance_deductions_total"])
    team_advances = Decimal(payout["team_advances_total"])
    other = Decimal(payout["other_payroll_deductions_total"])
    final_payable = Decimal(payout["actual_payout_on_approved"])

    waivers = _month_waivers_for_user(db, user_id=user.id, year=year, month=month)

    return {
        "user_id": str(user.id),
        "display_name": _member_display_name(user),
        "username": user.username,
        "role": str(user.role),
        "approved_revenue": str(approved),
        "matched_service_total": str(approved),
        "commission_pct": str(commission_pct),
        "expected_commission": str(expected_commission),
        "late_deductions": str(late),
        "absence_deductions": str(absence),
        "team_advances": str(team_advances),
        "other_deductions": str(other),
        "attendance_deductions_total": str(attendance_total),
        "final_commission_payable": str(final_payable),
        "status": status,
        "payout_state": payout_state,
        "statement_id": statement_id,
        "attendance_deduction_items": month_deduction_summary(
            db, user_id=user.id, year=year, month=month
        )["items"],
        "team_advance_items": payout["team_advance_items"],
        "attendance_waivers": waivers,
    }


def salary_payroll_row(
    db: Session,
    user: User,
    *,
    year: int,
    month: int,
) -> dict:
    monthly_salary = Decimal(user.fixed_salary) if user.fixed_salary is not None else _ZERO
    payout, _ = month_payout_breakdown(
        db,
        user,
        year=year,
        month=month,
        settled=_ZERO,
        sync_absences=False,
    )
    late = Decimal(payout["attendance_late_deductions_total"])
    absence = Decimal(payout["attendance_absence_deductions_total"])
    attendance_total = Decimal(payout["attendance_deductions_total"])
    team_advances = Decimal(payout["team_advances_total"])
    other = Decimal(payout["other_payroll_deductions_total"])
    final_payable = Decimal(payout["actual_payout_on_approved"])
    status = "approved" if user.account_status == AccountStatus.ACTIVE else "inactive"
    waivers = _month_waivers_for_user(db, user_id=user.id, year=year, month=month)

    return {
        "user_id": str(user.id),
        "display_name": _member_display_name(user),
        "username": user.username,
        "role": str(user.role),
        "monthly_salary": str(monthly_salary),
        "late_deductions": str(late),
        "absence_deductions": str(absence),
        "team_advances": str(team_advances),
        "other_deductions": str(other),
        "attendance_deductions_total": str(attendance_total),
        "final_salary_payable": str(final_payable),
        "status": status,
        "attendance_deduction_items": month_deduction_summary(
            db, user_id=user.id, year=year, month=month
        )["items"],
        "team_advance_items": payout["team_advance_items"],
        "attendance_waivers": waivers,
    }


def commission_payroll_summary(
    db: Session,
    *,
    year: int,
    month: int,
    financial_month_id,
) -> dict:
    months = [(year, month)]
    team = _team_members_for_payroll_period(db, months=months)
    commission_members = [
        u
        for u in team
        if earns_commission(u)
        and (
            u.account_status == AccountStatus.ACTIVE
            or _statement_for_month(db, financial_month_id=financial_month_id, user_id=u.id)
            is not None
        )
    ]
    commission_members.sort(
        key=lambda u: (_member_display_name(u).lower(), u.username.lower())
    )

    items = [
        commission_payroll_row(
            db,
            user,
            year=year,
            month=month,
            financial_month_id=financial_month_id,
        )
        for user in commission_members
    ]

    salary_items = _salary_payroll_rows(db, year=year, month=month)

    commission_total = sum((Decimal(i["final_commission_payable"]) for i in items), _ZERO)
    salary_total = sum((Decimal(i["final_salary_payable"]) for i in salary_items), _ZERO)

    return {
        "year": year,
        "month": month,
        "financial_month_id": str(financial_month_id) if financial_month_id else None,
        "commission_total": str(commission_total),
        "salary_total": str(salary_total),
        "items": items,
        "salary_items": salary_items,
    }
