"""Financial month lifecycle: open → grace period → locked, with snapshots."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.models.enums import FinancialMonthState, UserRole
from app.models.financial_month import FinancialMonth
from app.models.financial_month_snapshot import FinancialMonthSnapshot
from app.models.user import User
from app.services import audit_service, operations_analytics_service
from app.services.business_time import shop_tz

GRACE_PERIOD_DAYS = 3


def calendar_today() -> date:
    return datetime.now(shop_tz()).date()


def _month_start(year: int, month: int) -> datetime:
    return datetime(year, month, 1, tzinfo=shop_tz())


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = year * 12 + (month - 1) + delta
    return idx // 12, idx % 12 + 1


def get_open_financial_month(db: Session) -> FinancialMonth | None:
    return (
        db.query(FinancialMonth)
        .filter(FinancialMonth.state == FinancialMonthState.OPEN)
        .order_by(FinancialMonth.year.desc(), FinancialMonth.month.desc())
        .first()
    )


def get_financial_month(db: Session, *, year: int, month: int) -> FinancialMonth | None:
    return (
        db.query(FinancialMonth)
        .filter(FinancialMonth.year == year, FinancialMonth.month == month)
        .one_or_none()
    )


def ensure_financial_month_row(db: Session, *, year: int, month: int) -> FinancialMonth:
    row = get_financial_month(db, year=year, month=month)
    if row is not None:
        return row
    row = FinancialMonth(year=year, month=month, state=FinancialMonthState.OPEN)
    db.add(row)
    db.flush()
    return row


def _grace_ends_at(closed_at: datetime) -> datetime:
    return closed_at + timedelta(days=GRACE_PERIOD_DAYS)


def begin_grace_period(
    db: Session,
    fm: FinancialMonth,
    *,
    actor_user_id: uuid.UUID | None,
    manual: bool = False,
) -> FinancialMonth:
    if fm.state != FinancialMonthState.OPEN:
        raise ConflictError(
            "Only an open month can enter grace period.",
            code="MONTH_NOT_OPEN",
        )
    now = datetime.now(UTC)
    fm.state = FinancialMonthState.GRACE_PERIOD
    fm.closed_at = now
    fm.closed_by_user_id = actor_user_id
    fm.grace_ends_at = _grace_ends_at(now)
    db.add(fm)
    db.flush()
    if manual and actor_user_id:
        audit_service.write_audit_log(
            db,
            actor_user_id=actor_user_id,
            impersonator_user_id=None,
            action="finance.month_manual_close",
            entity_type="financial_month",
            entity_id=str(fm.id),
            message=f"Month {fm.year}-{fm.month:02d} closed into grace period",
            payload={"year": fm.year, "month": fm.month, "grace_ends_at": fm.grace_ends_at.isoformat()},
            ip_address=None,
        )
    return fm


def lock_financial_month(
    db: Session,
    fm: FinancialMonth,
    *,
    actor_user_id: uuid.UUID | None,
) -> FinancialMonth:
    if fm.state not in {FinancialMonthState.GRACE_PERIOD, FinancialMonthState.OPEN}:
        raise ConflictError(
            "Only open or grace-period months can be locked.",
            code="MONTH_NOT_LOCKABLE",
        )
    if fm.state == FinancialMonthState.OPEN:
        begin_grace_period(db, fm, actor_user_id=actor_user_id, manual=False)

    now = datetime.now(UTC)
    fm.state = FinancialMonthState.LOCKED
    fm.paid_locked_at = now
    fm.paid_locked_by_user_id = actor_user_id
    if fm.grace_ends_at is None:
        fm.grace_ends_at = now
    db.add(fm)
    capture_month_snapshot(db, fm)
    db.flush()
    audit_service.write_audit_log(
        db,
        actor_user_id=actor_user_id,
        impersonator_user_id=None,
        action="finance.month_locked",
        entity_type="financial_month",
        entity_id=str(fm.id),
        message=f"Month {fm.year}-{fm.month:02d} locked",
        payload={"year": fm.year, "month": fm.month},
        ip_address=None,
    )
    return fm


def capture_month_snapshot(db: Session, fm: FinancialMonth) -> FinancialMonthSnapshot:
    existing = (
        db.query(FinancialMonthSnapshot)
        .filter(FinancialMonthSnapshot.financial_month_id == fm.id)
        .one_or_none()
    )
    if existing is not None:
        return existing

    tz = shop_tz()
    start = datetime(fm.year, fm.month, 1, tzinfo=tz)
    if fm.month == 12:
        end = datetime(fm.year + 1, 1, 1, tzinfo=tz) - timedelta(microseconds=1)
    else:
        end = datetime(fm.year, fm.month + 1, 1, tzinfo=tz) - timedelta(microseconds=1)

    snap = operations_analytics_service.financial_snapshot(db, start=start, end=end)
    services_count = operations_analytics_service.month_services_count(
        db, year=fm.year, month=fm.month
    )
    payload: dict[str, Any] = {
        **snap,
        "services_rendered": services_count,
        "reconciliation_summary": operations_analytics_service.month_reconciliation_summary(
            db, year=fm.year, month=fm.month
        ),
        "payout_summary": operations_analytics_service.month_payout_summary(
            db, financial_month_id=fm.id
        ),
    }
    row = FinancialMonthSnapshot(
        financial_month_id=fm.id,
        year=fm.year,
        month=fm.month,
        payload=payload,
    )
    db.add(row)
    db.flush()
    return row


def process_lifecycle_transitions(db: Session) -> list[str]:
    """Apply automatic month boundary and grace-expiry transitions. Idempotent."""
    actions: list[str] = []
    today = calendar_today()
    cur_year, cur_month = today.year, today.month

    open_months = (
        db.query(FinancialMonth)
        .filter(FinancialMonth.state == FinancialMonthState.OPEN)
        .order_by(FinancialMonth.year.asc(), FinancialMonth.month.asc())
        .all()
    )

    for fm in open_months:
        if (fm.year, fm.month) < (cur_year, cur_month):
            begin_grace_period(db, fm, actor_user_id=None, manual=False)
            actions.append(f"grace:{fm.year}-{fm.month:02d}")

    cur = get_financial_month(db, year=cur_year, month=cur_month)
    if cur is None:
        cur = ensure_financial_month_row(db, year=cur_year, month=cur_month)
        actions.append(f"created:{cur_year}-{cur_month:02d}")
    elif cur.state == FinancialMonthState.OPEN:
        pass
    elif cur.state == FinancialMonthState.GRACE_PERIOD:
        pass
    else:
        pass

    stale_open = (
        db.query(FinancialMonth)
        .filter(FinancialMonth.state == FinancialMonthState.OPEN)
        .filter(
            (FinancialMonth.year != cur_year) | (FinancialMonth.month != cur_month)
        )
        .all()
    )
    for fm in stale_open:
        begin_grace_period(db, fm, actor_user_id=None, manual=False)
        actions.append(f"stale_open_grace:{fm.year}-{fm.month:02d}")

    now = datetime.now(UTC)
    grace_due = (
        db.query(FinancialMonth)
        .filter(FinancialMonth.state == FinancialMonthState.GRACE_PERIOD)
        .filter(FinancialMonth.grace_ends_at.isnot(None))
        .filter(FinancialMonth.grace_ends_at <= now)
        .all()
    )
    for fm in grace_due:
        lock_financial_month(db, fm, actor_user_id=None)
        actions.append(f"locked:{fm.year}-{fm.month:02d}")

    return actions


def manual_close_month(
    db: Session,
    *,
    actor: User,
    financial_month_id: uuid.UUID,
    ip_address: str | None,
) -> FinancialMonth:
    if actor.role not in {UserRole.ADMIN, UserRole.MANAGER}:
        from app.core.exceptions import ForbiddenError

        raise ForbiddenError("Only managers or admins may close a month.", code="FORBIDDEN")

    fm = db.get(FinancialMonth, financial_month_id)
    if fm is None:
        raise NotFoundError("Financial month not found.", code="FINANCIAL_MONTH_NOT_FOUND")

    process_lifecycle_transitions(db)
    if fm.state != FinancialMonthState.OPEN:
        raise ConflictError(
            "Only the active open month can be closed manually.",
            code="MONTH_NOT_OPEN",
        )

    today = calendar_today()
    if (fm.year, fm.month) > (today.year, today.month):
        raise ValidationAppError("Cannot close a future month.", code="MONTH_FUTURE")

    begin_grace_period(db, fm, actor_user_id=actor.id, manual=True)

    py, pm = _add_months(fm.year, fm.month, 1)
    if (py, pm) <= (today.year, today.month):
        nxt = ensure_financial_month_row(db, year=py, month=pm)
        if nxt.state != FinancialMonthState.OPEN:
            nxt.state = FinancialMonthState.OPEN
            nxt.closed_at = None
            nxt.closed_by_user_id = None
            nxt.grace_ends_at = None
            nxt.paid_locked_at = None
            nxt.paid_locked_by_user_id = None
            db.add(nxt)

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=None,
        action="finance.month_manual_close",
        entity_type="financial_month",
        entity_id=str(fm.id),
        message=f"Manual close for {fm.year}-{fm.month:02d}",
        payload={"grace_ends_at": fm.grace_ends_at.isoformat() if fm.grace_ends_at else None},
        ip_address=ip_address,
    )
    return fm


def serialize_month_row(
    db: Session,
    fm: FinancialMonth,
    *,
    role: UserRole | str,
    is_current: bool,
) -> dict[str, Any]:
    expense_sources = operations_analytics_service.month_expense_summary(
        db, year=fm.year, month=fm.month
    )
    tz = shop_tz()
    start = datetime(fm.year, fm.month, 1, tzinfo=tz)
    if fm.month == 12:
        end = datetime(fm.year + 1, 1, 1, tzinfo=tz) - timedelta(microseconds=1)
    else:
        end = datetime(fm.year, fm.month + 1, 1, tzinfo=tz) - timedelta(microseconds=1)
    live = operations_analytics_service.financial_snapshot(db, start=start, end=end)
    shaped = operations_analytics_service.shape_summary_for_role(live, role)

    snapshot_payload = None
    if fm.snapshot is not None:
        snapshot_payload = fm.snapshot.payload
    elif fm.state == FinancialMonthState.LOCKED:
        snap = (
            db.query(FinancialMonthSnapshot)
            .filter(FinancialMonthSnapshot.financial_month_id == fm.id)
            .one_or_none()
        )
        if snap:
            snapshot_payload = snap.payload

    revenue = shaped["total_revenue"]
    expenses = shaped["total_expenses"]
    operational = shaped["operational_expenses"]
    rent = shaped.get("rent_expenses", "0")
    payroll = shaped.get("payroll_commission", "0")
    if snapshot_payload:
        revenue = snapshot_payload.get("total_revenue", revenue)
        if str(role) == UserRole.ADMIN:
            expenses = snapshot_payload.get("total_expenses", expenses)
            operational = snapshot_payload.get("operational_expenses", operational)
            rent = snapshot_payload.get("rent_expenses", rent)
            payroll = snapshot_payload.get("payroll_commission", payroll)
        elif str(role) == UserRole.MANAGER:
            expenses = snapshot_payload.get("operational_expenses", operational)
            operational = expenses

    row: dict[str, Any] = {
        "id": str(fm.id),
        "year": fm.year,
        "month": fm.month,
        "state": str(fm.state),
        "is_current": is_current,
        "closed_at": fm.closed_at.isoformat() if fm.closed_at else None,
        "grace_ends_at": fm.grace_ends_at.isoformat() if fm.grace_ends_at else None,
        "locked_at": fm.paid_locked_at.isoformat() if fm.paid_locked_at else None,
        "total_revenue": revenue,
    }
    role_key = str(role)
    if role_key == UserRole.ADMIN:
        row.update(
            {
                "expense_sources": expense_sources,
                "total_expenses": expenses,
                "operational_expenses": operational,
                "rent_expenses": rent,
                "payroll_commission": payroll,
                "net_profit": snapshot_payload.get("net_profit", shaped["net_profit"])
                if snapshot_payload
                else shaped["net_profit"],
                "snapshot": snapshot_payload,
            }
        )
    elif role_key == UserRole.MANAGER:
        row.update(
            {
                "expense_sources": shaped["expense_sources"],
                "total_expenses": expenses,
                "operational_expenses": operational,
                "snapshot": (
                    {
                        k: snapshot_payload[k]
                        for k in snapshot_payload
                        if k
                        not in {
                            "net_profit",
                            "payroll_commission",
                            "rent_expenses",
                            "total_expenses",
                        }
                    }
                    if snapshot_payload
                    else None
                ),
            }
        )
    return row
