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
    LedgerRecordStream,
    PaymentMethod,
    RecordLifecycleState,
    UserRole,
)
from app.models.ledger import LedgerEntry
from app.services.business_time import shop_tz
from app.services import inventory_service
from app.services.ledger_service import (
    first_operational_occurred_at,
    official_services_count_for_calendar_month,
    official_services_revenue_in_range,
    row_counts_toward_official_revenue,
)

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

_RENT_CATEGORY_NAMES = frozenset(
    {
        "rent",
        "lease",
        "shop rent",
        "property rent",
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


def is_rent_expense_category(name: str | None) -> bool:
    """True when an expense category represents rent or lease (owner-level)."""
    if not name:
        return False
    normalized = name.strip().lower()
    if normalized in _RENT_CATEGORY_NAMES:
        return True
    return "rent" in normalized or "lease" in normalized


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
        # Caller should prefer snapshot_time_bounds(db, ...) for real history bounds.
        start = datetime(2000, 1, 1, tzinfo=tz)
        return start, now
    if preset == "custom" and custom_from and custom_to:
        start = datetime.combine(custom_from, datetime.min.time(), tzinfo=tz)
        end = datetime.combine(custom_to, datetime.max.time().replace(microsecond=0), tzinfo=tz)
        return start, end

    start = datetime(today.year, today.month, 1, tzinfo=tz)
    return start, now


def snapshot_time_bounds(
    db: Session,
    preset: str,
    *,
    custom_from: date | None = None,
    custom_to: date | None = None,
) -> tuple[datetime, datetime]:
    """Resolve [start, end] for financial snapshots; all-time starts at first real entry."""
    tz = shop_tz()
    now = datetime.now(tz)

    if preset == "all":
        first = first_operational_occurred_at(db)
        if first is None:
            return now, now
        if first.tzinfo is None:
            first = first.replace(tzinfo=tz)
        else:
            first = first.astimezone(tz)
        return first, now

    return preset_date_range(
        preset,
        custom_from=custom_from,
        custom_to=custom_to,
        tz=tz,
    )


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
        official_services_revenue_in_range(db, start=start, end=end)
    )
    inventory_totals = inventory_service.product_sales_totals_in_range(
        db, start=start, end=end
    )
    tracked_product_revenue = inventory_totals["revenue"]
    product_cost = inventory_totals["cost"]
    product_profit = inventory_totals["profit"]
    product_sales = _decimal(
        _active_in_range(db, start, end)
        .filter(LedgerEntry.entry_type == LedgerEntryType.SALE)
        .with_entities(func.coalesce(func.sum(LedgerEntry.amount), 0))
        .scalar()
    )
    if tracked_product_revenue > _ZERO:
        product_sales = tracked_product_revenue

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
    rent_shop_cash = _ZERO
    rent_admin_transfer = _ZERO
    payroll_expenses = _ZERO
    for row in expense_rows:
        amt = _decimal(row.amount)
        cat_name = category_names.get(row.expense_category_id) if row.expense_category_id else None
        is_payroll = is_payroll_expense_category(cat_name)
        is_rent = is_rent_expense_category(cat_name)
        bucket = normalize_expense_payment_source(
            str(row.payment_method) if row.payment_method else None
        )
        if bucket == ExpensePaymentSource.CASH_SHOP:
            shop_cash_expenses += amt
            if is_payroll:
                payroll_expenses += amt
            elif is_rent:
                rent_shop_cash += amt
            else:
                operational_shop_cash += amt
        elif bucket == ExpensePaymentSource.ADMIN_TRANSFER:
            admin_transfer_expenses += amt
            if is_payroll:
                payroll_expenses += amt
            elif is_rent:
                rent_admin_transfer += amt
            else:
                operational_admin_transfer += amt
        else:
            shop_cash_expenses += amt
            if is_payroll:
                payroll_expenses += amt
            elif is_rent:
                rent_shop_cash += amt
            else:
                operational_shop_cash += amt

    operational_expenses = operational_shop_cash + operational_admin_transfer
    rent_expenses = rent_shop_cash + rent_admin_transfer
    from app.services.payroll_service import period_team_payroll_obligations

    team_obligations = period_team_payroll_obligations(db, start=start, end=end)
    payroll_commission = team_obligations
    service_expenses = operational_expenses + rent_expenses + payroll_commission
    total_expenses = service_expenses
    total_revenue = services_revenue + product_sales
    service_net_profit = services_revenue - service_expenses
    total_business_net_profit = service_net_profit + product_profit
    net_profit = total_business_net_profit

    revenue_rows = (
        _active_in_range(db, start, end)
        .filter(LedgerEntry.entry_type.in_([LedgerEntryType.SERVICE, LedgerEntryType.SALE]))
        .all()
    )
    payment_methods = {
        PaymentMethod.CASH: _ZERO,
        PaymentMethod.TRANSFER: _ZERO,
        PaymentMethod.POS: _ZERO,
        "card": _ZERO,
    }
    for row in revenue_rows:
        if row.entry_type == LedgerEntryType.SERVICE and not row_counts_toward_official_revenue(
            db, row
        ):
            continue
        method = row.payment_method
        if method in payment_methods:
            payment_methods[method] += _decimal(row.amount)

    inventory_value = inventory_service.inventory_value_total(db)
    low_stock_count = len(inventory_service.low_stock_products(db, limit=500))

    from app.services import personal_consumption_service

    pc_totals = personal_consumption_service.consumption_totals_for_datetime_range(
        db, start=start, end=end
    )

    return {
        "total_revenue": str(total_revenue),
        "services_revenue": str(services_revenue),
        "service_expenses": str(service_expenses),
        "service_net_profit": str(service_net_profit),
        "product_sales_revenue": str(product_sales),
        "product_cost": str(product_cost),
        "product_profit": str(product_profit),
        "inventory_value": str(inventory_value),
        "low_stock_count": low_stock_count,
        **pc_totals,
        "total_expenses": str(total_expenses),
        "operational_expenses": str(operational_expenses),
        "rent_expenses": str(rent_expenses),
        "payroll_commission": str(payroll_commission),
        "net_profit": str(net_profit),
        "total_business_net_profit": str(total_business_net_profit),
        "expense_sources": {
            "shop_cash": str(shop_cash_expenses),
            "admin_transfer": str(admin_transfer_expenses),
            "operational_shop_cash": str(operational_shop_cash),
            "operational_admin_transfer": str(operational_admin_transfer),
            "rent_shop_cash": str(rent_shop_cash),
            "rent_admin_transfer": str(rent_admin_transfer),
            "total": str(total_expenses),
            "ledger_payroll": str(payroll_expenses),
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
    masked = {
        **snapshot,
        "total_expenses": operational,
        "service_expenses": operational,
        "service_net_profit": "0",
        "rent_expenses": "0",
        "payroll_commission": "0",
        "net_profit": "0",
        "total_business_net_profit": "0",
        "product_cost": "0",
        "product_profit": "0",
        "inventory_value": "0",
        "expense_sources": {
            **sources,
            "shop_cash": sources["operational_shop_cash"],
            "admin_transfer": sources["operational_admin_transfer"],
            "rent_shop_cash": "0",
            "rent_admin_transfer": "0",
            "total": operational,
            "operational_total": operational,
        },
    }
    return masked


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
    return official_services_count_for_calendar_month(db, year=year, month=month)


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
