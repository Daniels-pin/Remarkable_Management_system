from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models.barber_daily_summary import BarberDailySummary
from app.models.catalog import ExpenseCategory
from app.models.commission import MonthlyCommissionStatement
from app.models.enums import (
    BarberDailySummaryStatus,
    CommissionPayoutState,
    ExpensePaymentSource,
    LedgerEntryType,
    PaymentMethod,
    RecordLifecycleState,
    UserRole,
)
from app.models.ledger import LedgerEntry
from app.services.business_time import shop_tz

_ZERO = Decimal("0")

_PAYROLL_CATEGORY_NAMES = frozenset(
    {
        "salary",
        "commission",
        "commissions",
        "payroll",
        "wages",
        "barber payout",
        "staff payout",
    }
)


def _decimal(v) -> Decimal:
    if v is None:
        return _ZERO
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


def is_payroll_expense_category(name: str | None) -> bool:
    """True when an expense category represents salary or commission payouts."""
    if not name:
        return False
    normalized = name.strip().lower()
    if normalized in _PAYROLL_CATEGORY_NAMES:
        return True
    return any(token in normalized for token in ("salary", "commission", "payroll", "payout"))


def normalize_expense_payment_source(raw: str | None) -> str | None:
    """Map stored payment_method values to expense source buckets."""
    if raw is None:
        return None
    if raw in (ExpensePaymentSource.CASH_SHOP, PaymentMethod.CASH):
        return ExpensePaymentSource.CASH_SHOP
    if raw in (ExpensePaymentSource.ADMIN_TRANSFER, PaymentMethod.TRANSFER):
        return ExpensePaymentSource.ADMIN_TRANSFER
    return None


def preset_date_range(
    preset: str,
    *,
    custom_from: date | None = None,
    custom_to: date | None = None,
    tz: ZoneInfo | None = None,
) -> tuple[datetime, datetime]:
    tz = tz or shop_tz()
    now = datetime.now(tz)
    today = now.date()

    if preset == "today":
        start = datetime.combine(today, datetime.min.time(), tzinfo=tz)
        end = now
        return start, end
    if preset == "week":
        start_day = today - timedelta(days=today.weekday())
        start = datetime.combine(start_day, datetime.min.time(), tzinfo=tz)
        return start, now
    if preset == "month":
        start = datetime(today.year, today.month, 1, tzinfo=tz)
        return start, now
    if preset == "year":
        start = datetime(today.year, 1, 1, tzinfo=tz)
        return start, now
    if preset == "all":
        start = datetime(2000, 1, 1, tzinfo=tz)
        return start, now
    if preset == "custom" and custom_from and custom_to:
        start = datetime.combine(custom_from, datetime.min.time(), tzinfo=tz)
        end = datetime.combine(custom_to, datetime.max.time().replace(microsecond=0), tzinfo=tz)
        return start, end

    start = datetime(today.year, today.month, 1, tzinfo=tz)
    return start, now


def _active_in_range(db: Session, start: datetime, end: datetime):
    return db.query(LedgerEntry).filter(
        LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
        LedgerEntry.occurred_at >= start,
        LedgerEntry.occurred_at <= end,
    )


def financial_snapshot(
    db: Session,
    *,
    start: datetime,
    end: datetime,
) -> dict:
    services_revenue = _decimal(
        _active_in_range(db, start, end)
        .filter(LedgerEntry.entry_type == LedgerEntryType.SERVICE)
        .with_entities(func.coalesce(func.sum(LedgerEntry.amount), 0))
        .scalar()
    )
    product_sales = _decimal(
        _active_in_range(db, start, end)
        .filter(LedgerEntry.entry_type == LedgerEntryType.SALE)
        .with_entities(func.coalesce(func.sum(LedgerEntry.amount), 0))
        .scalar()
    )

    expense_rows = (
        _active_in_range(db, start, end)
        .filter(LedgerEntry.entry_type == LedgerEntryType.EXPENSE)
        .all()
    )
    category_ids = {r.expense_category_id for r in expense_rows if r.expense_category_id}
    category_names: dict = {}
    if category_ids:
        for cat in db.query(ExpenseCategory).filter(ExpenseCategory.id.in_(category_ids)).all():
            category_names[cat.id] = cat.name

    shop_cash_expenses = _ZERO
    admin_transfer_expenses = _ZERO
    operational_shop_cash = _ZERO
    operational_admin_transfer = _ZERO
    payroll_expenses = _ZERO
    for row in expense_rows:
        amt = _decimal(row.amount)
        cat_name = category_names.get(row.expense_category_id) if row.expense_category_id else None
        is_payroll = is_payroll_expense_category(cat_name)
        bucket = normalize_expense_payment_source(
            str(row.payment_method) if row.payment_method else None
        )
        if bucket == ExpensePaymentSource.CASH_SHOP:
            shop_cash_expenses += amt
            if is_payroll:
                payroll_expenses += amt
            else:
                operational_shop_cash += amt
        elif bucket == ExpensePaymentSource.ADMIN_TRANSFER:
            admin_transfer_expenses += amt
            if is_payroll:
                payroll_expenses += amt
            else:
                operational_admin_transfer += amt
        else:
            shop_cash_expenses += amt
            if is_payroll:
                payroll_expenses += amt
            else:
                operational_shop_cash += amt

    operational_expenses = operational_shop_cash + operational_admin_transfer
    total_expenses = shop_cash_expenses + admin_transfer_expenses
    total_revenue = services_revenue + product_sales
    net_profit = total_revenue - total_expenses

    revenue_types = [LedgerEntryType.SERVICE, LedgerEntryType.SALE]
    payment_methods = {
        PaymentMethod.CASH: _decimal(
            _active_in_range(db, start, end)
            .filter(
                LedgerEntry.entry_type.in_(revenue_types),
                LedgerEntry.payment_method == PaymentMethod.CASH,
            )
            .with_entities(func.coalesce(func.sum(LedgerEntry.amount), 0))
            .scalar()
        ),
        PaymentMethod.TRANSFER: _decimal(
            _active_in_range(db, start, end)
            .filter(
                LedgerEntry.entry_type.in_(revenue_types),
                LedgerEntry.payment_method == PaymentMethod.TRANSFER,
            )
            .with_entities(func.coalesce(func.sum(LedgerEntry.amount), 0))
            .scalar()
        ),
        PaymentMethod.POS: _decimal(
            _active_in_range(db, start, end)
            .filter(
                LedgerEntry.entry_type.in_(revenue_types),
                LedgerEntry.payment_method == PaymentMethod.POS,
            )
            .with_entities(func.coalesce(func.sum(LedgerEntry.amount), 0))
            .scalar()
        ),
        "card": _ZERO,
    }

    return {
        "total_revenue": str(total_revenue),
        "services_revenue": str(services_revenue),
        "product_sales_revenue": str(product_sales),
        "total_expenses": str(total_expenses),
        "operational_expenses": str(operational_expenses),
        "payroll_commission": str(payroll_expenses),
        "net_profit": str(net_profit),
        "expense_sources": {
            "shop_cash": str(shop_cash_expenses),
            "admin_transfer": str(admin_transfer_expenses),
            "operational_shop_cash": str(operational_shop_cash),
            "operational_admin_transfer": str(operational_admin_transfer),
            "total": str(total_expenses),
            "operational_total": str(operational_expenses),
        },
        "payment_methods": {k: str(v) for k, v in payment_methods.items()},
    }


def shape_summary_for_role(snapshot: dict, role: UserRole | str) -> dict:
    """Restrict owner-level finance fields for managers."""
    if str(role) != UserRole.MANAGER:
        return snapshot

    operational = snapshot["operational_expenses"]
    sources = snapshot["expense_sources"]
    return {
        **snapshot,
        "total_expenses": operational,
        "payroll_commission": "0",
        "net_profit": "0",
        "expense_sources": {
            **sources,
            "shop_cash": sources["operational_shop_cash"],
            "admin_transfer": sources["operational_admin_transfer"],
            "total": operational,
        },
    }


def month_calendar_bounds(*, year: int, month: int) -> tuple[datetime, datetime]:
    tz = shop_tz()
    start = datetime(year, month, 1, tzinfo=tz)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=tz) - timedelta(microseconds=1)
    else:
        end = datetime(year, month + 1, 1, tzinfo=tz) - timedelta(microseconds=1)
    return start, end


def month_expense_summary(db: Session, *, year: int, month: int) -> dict:
    start, end = month_calendar_bounds(year=year, month=month)
    snap = financial_snapshot(db, start=start, end=end)
    return snap["expense_sources"]


def month_services_count(db: Session, *, year: int, month: int) -> int:
    val = (
        db.query(func.count(LedgerEntry.id))
        .filter(
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            extract("year", LedgerEntry.business_date) == year,
            extract("month", LedgerEntry.business_date) == month,
        )
        .scalar()
    )
    return int(val or 0)


def month_reconciliation_summary(db: Session, *, year: int, month: int) -> dict:
    start, end = month_calendar_bounds(year=year, month=month)
    rows = (
        db.query(BarberDailySummary.status, func.count(BarberDailySummary.id))
        .filter(
            BarberDailySummary.business_date >= start.date(),
            BarberDailySummary.business_date <= end.date(),
        )
        .group_by(BarberDailySummary.status)
        .all()
    )
    by_status = {str(status): int(count) for status, count in rows}
    settled = sum(
        by_status.get(s, 0)
        for s in (
            BarberDailySummaryStatus.SETTLED,
            BarberDailySummaryStatus.SETTLED_BY_ADMIN,
        )
    )
    disputed = by_status.get(BarberDailySummaryStatus.DISPUTED, 0)
    pending = sum(
        by_status.get(s, 0)
        for s in (
            BarberDailySummaryStatus.OPEN,
            BarberDailySummaryStatus.AWAITING_BARBER_REVIEW,
            BarberDailySummaryStatus.ADMIN_PENDING,
        )
    )
    return {
        "by_status": by_status,
        "settled_days": settled,
        "disputed_days": disputed,
        "pending_days": pending,
    }


def month_payout_summary(db: Session, *, financial_month_id) -> dict:
    rows = (
        db.query(MonthlyCommissionStatement)
        .filter(MonthlyCommissionStatement.financial_month_id == financial_month_id)
        .all()
    )
    paid = sum(1 for r in rows if r.payout_state == CommissionPayoutState.PAID)
    unpaid = len(rows) - paid
    total_commission = sum((r.commission_amount for r in rows), _ZERO)
    return {
        "statement_count": len(rows),
        "paid_count": paid,
        "unpaid_count": unpaid,
        "total_commission": str(total_commission),
    }


def barber_month_summary(
    db: Session,
    *,
    barber_user_id,
    year: int,
    month: int,
) -> dict:
    start, end = month_calendar_bounds(year=year, month=month)
    services_revenue = _decimal(
        db.query(func.coalesce(func.sum(LedgerEntry.amount), 0))
        .filter(
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.employee_user_id == barber_user_id,
            LedgerEntry.occurred_at >= start,
            LedgerEntry.occurred_at <= end,
        )
        .scalar()
    )
    services_count = (
        db.query(func.count(LedgerEntry.id))
        .filter(
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.employee_user_id == barber_user_id,
            extract("year", LedgerEntry.business_date) == year,
            extract("month", LedgerEntry.business_date) == month,
        )
        .scalar()
    )
    return {
        "year": year,
        "month": month,
        "services_revenue": str(services_revenue),
        "services_count": int(services_count or 0),
    }
