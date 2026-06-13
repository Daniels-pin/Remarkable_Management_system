"""Ledger orchestration: dual-stream indexed reconciliation."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from collections.abc import Iterable
from typing import Any

from sqlalchemy import and_, extract, func, or_
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.models.barber_sequence_counter import BarberSequenceCounter
from app.models.shop_ledger_sequence_counter import ShopLedgerSequenceCounter
from app.models.enums import (
    LedgerEntryType,
    LedgerReconciliationStatus,
    LedgerRecordStream,
    PaymentMethod,
    RecordLifecycleState,
    UserRole,
)
from app.models.catalog import ServiceType
from app.models.financial_month import FinancialMonth
from app.models.ledger import LedgerEntry
from app.models.ledger_payment_method_adjustment import LedgerPaymentMethodAdjustment
from app.models.user import User
from app.services import audit_service, catalog_service
from app.services.business_time import barber_may_edit_entry, business_date_for_instant, shop_tz
from app.services.financial_month_util import (
    require_financial_month_for_new_entry,
    require_writable_month_for_entry,
)

logger = logging.getLogger(__name__)

# Composite slot identity: employee + financial month + index (never index alone).
ReconciliationSlotKey = tuple[uuid.UUID, uuid.UUID, int]


@dataclass(frozen=True)
class ReconciliationSlot:
    """Paired employee/manager records at the same employee, month, and index."""

    financial_month_id: uuid.UUID
    index: int
    employee: LedgerEntry | None
    manager: LedgerEntry | None

    @property
    def slot_key(self) -> ReconciliationSlotKey:
        barber_id = (self.employee or self.manager).employee_user_id  # type: ignore[union-attr]
        return (barber_id, self.financial_month_id, self.index)


def _is_voided(row: LedgerEntry | None) -> bool:
    return row is not None and row.record_lifecycle == RecordLifecycleState.DELETED


def _has_pending_void(row: LedgerEntry | None) -> bool:
    return (
        row is not None
        and row.reconciliation_status == LedgerReconciliationStatus.PENDING_DELETE_CONFIRMATION
    )


def _service_base_filter(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    include_voided: bool = False,
):
    q = db.query(LedgerEntry).filter(
        LedgerEntry.employee_user_id == barber_user_id,
        LedgerEntry.entry_type == LedgerEntryType.SERVICE,
    )
    if include_voided:
        q = q.filter(
            LedgerEntry.record_lifecycle.in_(
                (RecordLifecycleState.ACTIVE, RecordLifecycleState.DELETED)
            )
        )
    else:
        q = q.filter(LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE)
    return q


def _stream_filter(q, stream: LedgerRecordStream):
    return q.filter(LedgerEntry.record_stream == stream)


def _active_service_index_taken(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    financial_month_id: uuid.UUID,
    stream: LedgerRecordStream,
    index: int,
) -> bool:
    """True when an active service row already occupies this employee+month+stream index."""
    return (
        db.query(
            _stream_filter(
                _service_base_filter(db, barber_user_id=barber_user_id),
                stream,
            )
            .filter(
                LedgerEntry.financial_month_id == financial_month_id,
                LedgerEntry.barber_sequence_index == index,
            )
            .exists()
        ).scalar()
        is True
    )


def ensure_sequence_counter_at_least(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    financial_month_id: uuid.UUID,
    stream: LedgerRecordStream,
    minimum_next_index: int,
) -> None:
    """Raise the stream counter floor so explicit-index rows cannot be re-issued."""
    if minimum_next_index < 1:
        minimum_next_index = 1
    counter = db.get(
        BarberSequenceCounter,
        (barber_user_id, financial_month_id, stream),
    )
    if counter is None:
        db.add(
            BarberSequenceCounter(
                barber_user_id=barber_user_id,
                financial_month_id=financial_month_id,
                record_stream=stream,
                next_index=minimum_next_index,
            )
        )
        return
    if counter.next_index < minimum_next_index:
        counter.next_index = minimum_next_index
        db.add(counter)


def sync_sequence_counter_from_ledger(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    financial_month_id: uuid.UUID,
    stream: LedgerRecordStream,
) -> int:
    """Set counter.next_index to MAX(active index) + 1 for the scope."""
    max_idx = (
        db.query(func.max(LedgerEntry.barber_sequence_index))
        .filter(
            LedgerEntry.employee_user_id == barber_user_id,
            LedgerEntry.financial_month_id == financial_month_id,
            LedgerEntry.record_stream == stream,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            LedgerEntry.barber_sequence_index.isnot(None),
        )
        .scalar()
    )
    next_index = (max_idx or 0) + 1
    ensure_sequence_counter_at_least(
        db,
        barber_user_id=barber_user_id,
        financial_month_id=financial_month_id,
        stream=stream,
        minimum_next_index=next_index,
    )
    return next_index


def allocate_next_sequence_index(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    financial_month_id: uuid.UUID,
    stream: LedgerRecordStream,
) -> int:
    """Allocate the next free index for an employee+month+stream (resets each month)."""
    counter = db.get(
        BarberSequenceCounter,
        (barber_user_id, financial_month_id, stream),
    )
    if counter is None:
        counter = BarberSequenceCounter(
            barber_user_id=barber_user_id,
            financial_month_id=financial_month_id,
            record_stream=stream,
            next_index=1,
        )
        db.add(counter)
        db.flush()

    for _ in range(512):
        idx = counter.next_index
        counter.next_index = idx + 1
        db.add(counter)
        if not _active_service_index_taken(
            db,
            barber_user_id=barber_user_id,
            financial_month_id=financial_month_id,
            stream=stream,
            index=idx,
        ):
            return idx

    raise ValidationAppError(
        "Could not allocate a unique ledger index for this stream.",
        code="INDEX_EXHAUSTED",
    )


def allocate_shop_sequence_index(
    db: Session,
    *,
    financial_month_id: uuid.UUID,
    entry_type: LedgerEntryType,
) -> int:
    """Allocate the next global shop index for sales or expenses in a financial month."""
    if entry_type not in (LedgerEntryType.SALE, LedgerEntryType.EXPENSE):
        raise ValidationAppError(
            "Shop sequence applies only to sales and expenses.",
            code="INVALID_ENTRY_TYPE",
        )
    counter = db.get(ShopLedgerSequenceCounter, (financial_month_id, entry_type))
    if counter is None:
        counter = ShopLedgerSequenceCounter(
            financial_month_id=financial_month_id,
            entry_type=entry_type,
            next_index=1,
        )
        db.add(counter)
        db.flush()
    idx = counter.next_index
    counter.next_index = idx + 1
    db.add(counter)
    return idx


_MONTH_ABBREVS = (
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
)


def financial_month_prefix(*, year: int, month: int) -> str:
    """Compact month tag for display indexes, e.g. JUN26, JAN27."""
    if month < 1 or month > 12:
        raise ValidationAppError("Invalid calendar month.", code="INVALID_MONTH")
    return f"{_MONTH_ABBREVS[month - 1]}{year % 100:02d}"


def format_ledger_index_label(
    entry_type: LedgerEntryType,
    index: int | None,
    *,
    year: int | None = None,
    month: int | None = None,
) -> str | None:
    """Human index label: JUN26-001 (services), S-JUN26-001 (sales), E-JUN26-001 (expenses)."""
    if index is None:
        return None
    month_tag = (
        f"{financial_month_prefix(year=year, month=month)}-" if year is not None and month is not None else ""
    )
    seq = f"{index:03d}"
    if entry_type == LedgerEntryType.SALE:
        return f"S-{month_tag}{seq}"
    if entry_type == LedgerEntryType.EXPENSE:
        return f"E-{month_tag}{seq}"
    if entry_type == LedgerEntryType.SERVICE:
        return f"{month_tag}{seq}"
    return str(index)


def load_financial_months_map(
    db: Session,
    ids: Iterable[uuid.UUID],
) -> dict[uuid.UUID, FinancialMonth]:
    unique = {i for i in ids if i}
    if not unique:
        return {}
    return {
        fm.id: fm
        for fm in db.query(FinancialMonth).filter(FinancialMonth.id.in_(unique)).all()
    }


def index_label_for_entry(db: Session, entry: LedgerEntry) -> str | None:
    """Month-aware display label for a ledger row."""
    if entry.barber_sequence_index is None:
        return None
    fm = db.get(FinancialMonth, entry.financial_month_id)
    return format_ledger_index_label(
        entry.entry_type,
        entry.barber_sequence_index,
        year=fm.year if fm else None,
        month=fm.month if fm else None,
    )


def apply_auto_match_if_eligible(
    db: Session,
    *,
    employee: LedgerEntry | None,
    manager: LedgerEntry | None,
) -> bool:
    """
    When both streams exist at the same index with equal amounts, mark both approved.

    Returns True when auto-match was applied.
    """
    if employee is None or manager is None:
        return False
    if _is_voided(employee) or _is_voided(manager):
        return False
    if _has_pending_void(employee):
        return False
    if employee.amount != manager.amount:
        return False
    now = datetime.now(UTC)
    changed = False
    for row in (employee, manager):
        if row.reconciliation_status in {
            None,
            LedgerReconciliationStatus.PENDING,
        }:
            row.reconciliation_status = LedgerReconciliationStatus.APPROVED
            row.approved_at = now
            db.add(row)
            changed = True
    return changed


def try_auto_match_for_service_row(db: Session, row: LedgerEntry) -> bool:
    """Run auto-match after creating or updating a service stream row."""
    employee, manager = paired_rows_for_service(db, row)
    return apply_auto_match_if_eligible(db, employee=employee, manager=manager)


def is_official_manager_service_row(row: LedgerEntry) -> bool:
    """True when a service line belongs on the manager/admin operational ledger."""
    return (
        row.entry_type == LedgerEntryType.SERVICE
        and row.record_stream == LedgerRecordStream.MANAGER
    )


def official_service_amount(row: LedgerEntry) -> Decimal:
    return row.amount


def _stream_amount(row: LedgerEntry | None) -> Decimal | None:
    if row is None:
        return None
    return row.amount


def _row_recency_key(row: LedgerEntry) -> tuple[datetime, datetime]:
    return (row.occurred_at, row.created_at)


def _prefer_latest_row(existing: LedgerEntry | None, candidate: LedgerEntry) -> LedgerEntry:
    """When duplicate slot rows exist, keep the most recent (matches find_*_at_index)."""
    if existing is None:
        return candidate
    if _row_recency_key(candidate) > _row_recency_key(existing):
        return candidate
    return existing


def _slot_key_for_row(row: LedgerEntry) -> ReconciliationSlotKey | None:
    if (
        row.employee_user_id is None
        or row.financial_month_id is None
        or row.barber_sequence_index is None
    ):
        return None
    return (row.employee_user_id, row.financial_month_id, row.barber_sequence_index)


def _log_reconciliation_decision(
    *,
    employee: LedgerEntry | None,
    manager: LedgerEntry | None,
    status: str,
    reason: str,
) -> None:
    """Temporary audit logging while investigating reconciliation integrity."""
    primary = employee or manager
    barber_id = primary.employee_user_id if primary else None
    fm_id = primary.financial_month_id if primary else None
    index = primary.barber_sequence_index if primary else None
    logger.info(
        "reconciliation decision employee_id=%s financial_month_id=%s index=%s "
        "employee_amount=%s manager_amount=%s status=%s reason=%s",
        barber_id,
        fm_id,
        index,
        str(employee.amount) if employee else None,
        str(manager.amount) if manager else None,
        status,
        reason,
    )


def _pair_reconciliation_status(
    employee: LedgerEntry | None,
    manager: LedgerEntry | None,
) -> str:
    """Compare employee vs manager streams by employee+month+index (presence + amount only)."""
    if employee is None and manager is None:
        status = "waiting_for_reconciliation"
        _log_reconciliation_decision(
            employee=employee,
            manager=manager,
            status=status,
            reason="both_streams_missing",
        )
        return status

    if _has_pending_void(employee):
        status = "pending_delete_confirmation"
        _log_reconciliation_decision(
            employee=employee,
            manager=manager,
            status=status,
            reason="employee_pending_void",
        )
        return status

    if _is_voided(employee) and manager is not None and not _is_voided(manager):
        status = "employee_record_voided"
        _log_reconciliation_decision(
            employee=employee,
            manager=manager,
            status=status,
            reason="employee_voided_manager_active",
        )
        return status
    if _is_voided(manager) and employee is not None and not _is_voided(employee):
        status = "manager_record_voided"
        _log_reconciliation_decision(
            employee=employee,
            manager=manager,
            status=status,
            reason="manager_voided_employee_active",
        )
        return status
    if _is_voided(employee) and _is_voided(manager):
        status = "employee_record_voided"
        _log_reconciliation_decision(
            employee=employee,
            manager=manager,
            status=status,
            reason="both_streams_voided",
        )
        return status

    if employee is None:
        if manager is not None and _is_voided(manager):
            status = "manager_record_voided"
            reason = "manager_voided_no_employee"
        else:
            status = "missing_employee_entry"
            reason = "manager_only_pending_employee"
        _log_reconciliation_decision(
            employee=employee,
            manager=manager,
            status=status,
            reason=reason,
        )
        return status

    if manager is None:
        if _is_voided(employee):
            status = "employee_record_voided"
            reason = "employee_voided_no_manager"
        else:
            status = "missing_manager_entry"
            reason = "employee_only_pending_manager"
        _log_reconciliation_decision(
            employee=employee,
            manager=manager,
            status=status,
            reason=reason,
        )
        return status

    emp_amt = _stream_amount(employee)
    mgr_amt = _stream_amount(manager)
    if emp_amt is not None and mgr_amt is not None and emp_amt != mgr_amt:
        status = "mismatch"
        _log_reconciliation_decision(
            employee=employee,
            manager=manager,
            status=status,
            reason="both_present_amounts_differ",
        )
        return status

    status = "matched"
    _log_reconciliation_decision(
        employee=employee,
        manager=manager,
        status=status,
        reason="both_present_amounts_equal",
    )
    return status


# Service revenue channels — excludes expense-only payment sources.
_SERVICE_PAYMENT_METHODS = frozenset(
    {PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.POS}
)
_FINANCIALLY_EXCLUDED_COMPARISONS = frozenset(
    {
        "employee_record_voided",
        "manager_record_voided",
        "pending_delete_confirmation",
    }
)

# Manager-stream rows that contribute to official shop service revenue.
_OFFICIAL_REVENUE_COMPARISONS = frozenset({"matched", "missing_employee_entry"})


def row_counts_toward_official_revenue(db: Session, row: LedgerEntry) -> bool:
    """True when a ledger row should affect active operational service revenue."""
    if row.entry_type != LedgerEntryType.SERVICE:
        return False
    if row.record_stream != LedgerRecordStream.MANAGER:
        return False
    if row.record_lifecycle != RecordLifecycleState.ACTIVE:
        return False
    status = comparison_status_for_service_row(db, row)
    return status in _OFFICIAL_REVENUE_COMPARISONS


def official_services_revenue_in_range(
    db: Session,
    *,
    start: datetime,
    end: datetime,
) -> Decimal:
    """
    Sum manager-stream service revenue for the period, excluding voided pairs and
    pending void requests (aligned with barber approved/pending bucket rules).
    """
    manager_rows = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_stream == LedgerRecordStream.MANAGER,
            LedgerEntry.occurred_at >= start,
            LedgerEntry.occurred_at <= end,
        )
        .all()
    )
    if not manager_rows:
        return Decimal(0)

    status_by_id = comparison_status_map_for_rows(db, manager_rows)
    total = Decimal(0)
    for row in manager_rows:
        if status_by_id.get(row.id) in _OFFICIAL_REVENUE_COMPARISONS:
            total += row.amount
    return total


def official_services_count_for_calendar_month(
    db: Session,
    *,
    year: int,
    month: int,
) -> int:
    """Active official service lines in a calendar month (void/pending-void excluded)."""
    tz = shop_tz()
    start = datetime(year, month, 1, tzinfo=tz)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=tz) - timedelta(microseconds=1)
    else:
        end = datetime(year, month + 1, 1, tzinfo=tz) - timedelta(microseconds=1)
    manager_rows = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_stream == LedgerRecordStream.MANAGER,
            LedgerEntry.occurred_at >= start,
            LedgerEntry.occurred_at <= end,
        )
        .all()
    )
    if not manager_rows:
        return 0
    status_by_id = comparison_status_map_for_rows(db, manager_rows)
    return sum(
        1 for row in manager_rows if status_by_id.get(row.id) in _OFFICIAL_REVENUE_COMPARISONS
    )


def find_employee_row_at_index(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    financial_month_id: uuid.UUID,
    index: int,
) -> LedgerEntry | None:
    return (
        _stream_filter(
            _service_base_filter(db, barber_user_id=barber_user_id, include_voided=True),
            LedgerRecordStream.EMPLOYEE,
        )
        .filter(
            LedgerEntry.financial_month_id == financial_month_id,
            LedgerEntry.barber_sequence_index == index,
        )
        # Local/test data can contain duplicates for the same slot; prefer the latest row
        # rather than crashing with MultipleResultsFound.
        .order_by(LedgerEntry.occurred_at.desc(), LedgerEntry.created_at.desc())
        .first()
    )


def paired_rows_for_service(
    db: Session,
    row: LedgerEntry,
) -> tuple[LedgerEntry | None, LedgerEntry | None]:
    """Resolve employee/manager streams for the same barber, month, and index."""
    if (
        row.entry_type != LedgerEntryType.SERVICE
        or row.employee_user_id is None
        or row.financial_month_id is None
        or row.barber_sequence_index is None
    ):
        return None, None

    barber_id = row.employee_user_id
    fm_id = row.financial_month_id
    index = row.barber_sequence_index

    if row.record_stream == LedgerRecordStream.EMPLOYEE:
        employee = row
        manager = find_manager_row_at_index(
            db,
            barber_user_id=barber_id,
            financial_month_id=fm_id,
            index=index,
        )
    elif row.record_stream == LedgerRecordStream.MANAGER:
        manager = row
        employee = find_employee_row_at_index(
            db,
            barber_user_id=barber_id,
            financial_month_id=fm_id,
            index=index,
        )
    else:
        return None, None
    return employee, manager


def comparison_status_for_service_row(db: Session, row: LedgerEntry) -> str | None:
    """
    Central reconciliation comparison for a single service ledger row.

    Pairs by employee_user_id + financial_month_id + barber_sequence_index (not timestamps).
    """
    if row.entry_type != LedgerEntryType.SERVICE:
        return None
    employee, manager = paired_rows_for_service(db, row)
    if employee is None and manager is None:
        return "waiting_for_reconciliation"
    return _pair_reconciliation_status(employee, manager)


def comparison_status_map_for_rows(db: Session, rows: list[LedgerEntry]) -> dict[uuid.UUID, str]:
    """Batch comparison_status for many service rows (avoids N+1 on ledger lists)."""
    service_rows = [
        r
        for r in rows
        if r.entry_type == LedgerEntryType.SERVICE
        and r.employee_user_id is not None
        and r.financial_month_id is not None
        and r.barber_sequence_index is not None
    ]
    if not service_rows:
        return {}

    indexes_by_scope: dict[tuple[uuid.UUID, uuid.UUID], set[int]] = {}
    for r in service_rows:
        scope = (r.employee_user_id, r.financial_month_id)
        indexes_by_scope.setdefault(scope, set()).add(r.barber_sequence_index)

    employee_by_slot: dict[tuple[uuid.UUID, uuid.UUID, int], LedgerEntry] = {}
    manager_by_slot: dict[tuple[uuid.UUID, uuid.UUID, int], LedgerEntry] = {}

    for (barber_id, fm_id), indexes in indexes_by_scope.items():
        idx_list = list(indexes)
        for r in (
            _stream_filter(
                _service_base_filter(db, barber_user_id=barber_id, include_voided=True),
                LedgerRecordStream.EMPLOYEE,
            )
            .filter(
                LedgerEntry.financial_month_id == fm_id,
                LedgerEntry.barber_sequence_index.in_(idx_list),
            )
            .all()
        ):
            slot_key = (barber_id, fm_id, r.barber_sequence_index)
            employee_by_slot[slot_key] = _prefer_latest_row(
                employee_by_slot.get(slot_key),
                r,
            )
        for r in (
            _stream_filter(
                _service_base_filter(db, barber_user_id=barber_id, include_voided=True),
                LedgerRecordStream.MANAGER,
            )
            .filter(
                LedgerEntry.financial_month_id == fm_id,
                LedgerEntry.barber_sequence_index.in_(idx_list),
            )
            .all()
        ):
            slot_key = (barber_id, fm_id, r.barber_sequence_index)
            manager_by_slot[slot_key] = _prefer_latest_row(
                manager_by_slot.get(slot_key),
                r,
            )

    out: dict[uuid.UUID, str] = {}
    for r in service_rows:
        slot_key = _slot_key_for_row(r)
        if slot_key is None:
            continue
        employee = employee_by_slot.get(slot_key)
        manager = manager_by_slot.get(slot_key)
        out[r.id] = _pair_reconciliation_status(employee, manager)
    return out


def _slot_sort_key(slot: ReconciliationSlot) -> tuple:
    dates: list[date] = []
    if slot.employee and slot.employee.business_date:
        dates.append(slot.employee.business_date)
    if slot.manager and slot.manager.business_date:
        dates.append(slot.manager.business_date)
    latest = max(dates) if dates else date.min
    latest_occurred = datetime.min.replace(tzinfo=UTC)
    for row in (slot.employee, slot.manager):
        if row is not None and row.occurred_at > latest_occurred:
            latest_occurred = row.occurred_at
    return (-latest.toordinal(), slot.index, latest_occurred)


def _build_slots_from_rows(
    employee_rows: list[LedgerEntry],
    manager_rows: list[LedgerEntry],
) -> list[ReconciliationSlot]:
    """Pair rows strictly by employee_user_id + financial_month_id + barber_sequence_index."""
    by_slot: dict[tuple[uuid.UUID, int], ReconciliationSlot] = {}

    for r in employee_rows:
        slot_key = _slot_key_for_row(r)
        if slot_key is None:
            continue
        _, fm_id, idx = slot_key
        map_key = (fm_id, idx)
        slot = by_slot.get(map_key)
        if slot is None:
            by_slot[map_key] = ReconciliationSlot(
                financial_month_id=fm_id,
                index=idx,
                employee=r,
                manager=None,
            )
        else:
            by_slot[map_key] = ReconciliationSlot(
                financial_month_id=fm_id,
                index=idx,
                employee=_prefer_latest_row(slot.employee, r),
                manager=slot.manager,
            )

    for r in manager_rows:
        slot_key = _slot_key_for_row(r)
        if slot_key is None:
            continue
        _, fm_id, idx = slot_key
        map_key = (fm_id, idx)
        slot = by_slot.get(map_key)
        if slot is None:
            by_slot[map_key] = ReconciliationSlot(
                financial_month_id=fm_id,
                index=idx,
                employee=None,
                manager=r,
            )
        else:
            by_slot[map_key] = ReconciliationSlot(
                financial_month_id=fm_id,
                index=idx,
                employee=slot.employee,
                manager=_prefer_latest_row(slot.manager, r),
            )

    return sorted(by_slot.values(), key=_slot_sort_key)


def _slot_from_key(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    financial_month_id: uuid.UUID,
    index: int,
) -> ReconciliationSlot:
    """Authoritative pairing for one reconciliation slot."""
    employee = find_employee_row_at_index(
        db,
        barber_user_id=barber_user_id,
        financial_month_id=financial_month_id,
        index=index,
    )
    manager = find_manager_row_at_index(
        db,
        barber_user_id=barber_user_id,
        financial_month_id=financial_month_id,
        index=index,
    )
    return ReconciliationSlot(
        financial_month_id=financial_month_id,
        index=index,
        employee=employee,
        manager=manager,
    )


def _financial_month_ids_for_calendar(db: Session, *, year: int, month: int) -> list[uuid.UUID]:
    rows = (
        db.query(FinancialMonth.id)
        .filter(FinancialMonth.year == year, FinancialMonth.month == month)
        .all()
    )
    return [row[0] for row in rows]


def _slots_for_calendar_month(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    year: int,
    month: int,
) -> list[ReconciliationSlot]:
    """
    Reconciliation slots for a calendar month.

    Prefer financial_month alignment (authoritative for index pairing); fall back to
    business_date when financial_month_id is missing on legacy rows.
    """
    fm_ids = _financial_month_ids_for_calendar(db, year=year, month=month)
    if fm_ids:
        fm_filter = LedgerEntry.financial_month_id.in_(fm_ids)
        employee_rows = (
            _stream_filter(
                _service_base_filter(db, barber_user_id=barber_user_id, include_voided=True),
                LedgerRecordStream.EMPLOYEE,
            )
            .filter(fm_filter)
            .all()
        )
        manager_rows = (
            _stream_filter(
                _service_base_filter(db, barber_user_id=barber_user_id, include_voided=True),
                LedgerRecordStream.MANAGER,
            )
            .filter(fm_filter)
            .all()
        )
        return _build_slots_from_rows(employee_rows, manager_rows)

    month_filter = (
        extract("year", LedgerEntry.business_date) == year,
        extract("month", LedgerEntry.business_date) == month,
    )
    employee_rows = (
        _stream_filter(
            _service_base_filter(db, barber_user_id=barber_user_id, include_voided=True),
            LedgerRecordStream.EMPLOYEE,
        )
        .filter(*month_filter)
        .all()
    )
    manager_rows = (
        _stream_filter(
            _service_base_filter(db, barber_user_id=barber_user_id, include_voided=True),
            LedgerRecordStream.MANAGER,
        )
        .filter(*month_filter)
        .all()
    )
    return _build_slots_from_rows(employee_rows, manager_rows)


def _slots_for_business_day(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    business_day: date,
) -> list[ReconciliationSlot]:
    """Day workspace: one slot per employee+month+index touched on this business day."""
    employee_day = (
        _stream_filter(
            _service_base_filter(db, barber_user_id=barber_user_id, include_voided=True),
            LedgerRecordStream.EMPLOYEE,
        )
        .filter(LedgerEntry.business_date == business_day)
        .all()
    )
    manager_day = (
        _stream_filter(
            _service_base_filter(db, barber_user_id=barber_user_id, include_voided=True),
            LedgerRecordStream.MANAGER,
        )
        .filter(LedgerEntry.business_date == business_day)
        .all()
    )

    slot_keys: set[tuple[uuid.UUID, int]] = set()
    for row in (*employee_day, *manager_day):
        if row.financial_month_id is None or row.barber_sequence_index is None:
            continue
        slot_keys.add((row.financial_month_id, row.barber_sequence_index))

    if not slot_keys:
        return []

    slots = [
        _slot_from_key(
            db,
            barber_user_id=barber_user_id,
            financial_month_id=fm_id,
            index=idx,
        )
        for fm_id, idx in slot_keys
    ]
    return sorted(slots, key=_slot_sort_key)


def find_manager_row_at_index(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    financial_month_id: uuid.UUID,
    index: int,
) -> LedgerEntry | None:
    return (
        _stream_filter(
            _service_base_filter(db, barber_user_id=barber_user_id, include_voided=True),
            LedgerRecordStream.MANAGER,
        )
        .filter(
            LedgerEntry.financial_month_id == financial_month_id,
            LedgerEntry.barber_sequence_index == index,
        )
        # Local/test data can contain duplicates for the same slot; prefer the latest row
        # rather than crashing with MultipleResultsFound.
        .order_by(LedgerEntry.occurred_at.desc(), LedgerEntry.created_at.desc())
        .first()
    )


def build_comparison_payload(
    slot: ReconciliationSlot,
    *,
    service_names: dict[uuid.UUID, str],
    year: int | None = None,
    month: int | None = None,
    financial_months: dict[uuid.UUID, FinancialMonth] | None = None,
) -> dict[str, Any]:
    """Side-by-side reconciliation row for API responses."""
    label_year, label_month = year, month
    if (label_year is None or label_month is None) and financial_months:
        fm = financial_months.get(slot.financial_month_id)
        if fm is not None:
            label_year, label_month = fm.year, fm.month
    employee = slot.employee
    manager = slot.manager
    comparison = _pair_reconciliation_status(employee, manager)

    def _side(row: LedgerEntry | None) -> dict[str, Any] | None:
        if row is None:
            return None
        name = service_names.get(row.service_type_id) if row.service_type_id else "Service"
        return {
            "id": str(row.id),
            "amount": str(row.amount),
            "service_name": name,
            "service_type_id": str(row.service_type_id) if row.service_type_id else None,
            "occurred_at": row.occurred_at.isoformat(),
            "business_date": row.business_date.isoformat() if row.business_date else None,
            "approved_at": row.approved_at.isoformat() if row.approved_at else None,
            "payment_method": str(row.payment_method) if row.payment_method else None,
            "note": row.note,
            "reconciliation_status": str(row.reconciliation_status)
            if row.reconciliation_status
            else None,
            "record_lifecycle": str(row.record_lifecycle),
            "is_voided": _is_voided(row),
            "void_reason": row.void_reason,
            "voided_at": row.deleted_at.isoformat() if row.deleted_at else None,
            "voided_by_user_id": str(row.deleted_by_user_id) if row.deleted_by_user_id else None,
            "pending_void_reason": row.pending_void_reason,
            "pending_void_by_user_id": (
                str(row.pending_void_by_user_id) if row.pending_void_by_user_id else None
            ),
            "pending_void_requested_at": (
                row.pending_void_requested_at.isoformat()
                if row.pending_void_requested_at
                else None
            ),
        }

    emp_side = _side(employee)
    mgr_side = _side(manager)
    primary = employee or manager
    display_service = (
        (emp_side or {}).get("service_name")
        or (mgr_side or {}).get("service_name")
        or "Service"
    )
    display_occurred = primary.occurred_at.isoformat() if primary else None
    display_date = primary.business_date.isoformat() if primary and primary.business_date else None
    display_payment = (
        str(manager.payment_method)
        if manager and manager.payment_method
        else str(employee.payment_method)
        if employee and employee.payment_method
        else None
    )
    display_note = (manager.note if manager and manager.note else None) or (
        employee.note if employee and employee.note else None
    )

    employee_amt = emp_side["amount"] if emp_side else None
    manager_amt = mgr_side["amount"] if mgr_side else None
    if manager is not None:
        display_amount = str(manager.amount)
    elif employee is not None:
        display_amount = str(employee.amount)
    else:
        display_amount = None
    row_id = (
        f"{slot.financial_month_id}:{slot.index}:"
        f"{employee.id if employee else ''}:{manager.id if manager else ''}"
    )

    recon_status = None
    if employee and employee.reconciliation_status:
        recon_status = str(employee.reconciliation_status)
    elif manager and manager.reconciliation_status:
        recon_status = str(manager.reconciliation_status)

    reconciled_at: str | None = None
    if comparison == "matched":
        approved_times = [
            row.approved_at
            for row in (employee, manager)
            if row is not None and row.approved_at is not None
        ]
        if approved_times:
            reconciled_at = max(approved_times).isoformat()

    return {
        "id": row_id,
        "employee_entry_id": str(employee.id) if employee else None,
        "manager_entry_id": str(manager.id) if manager else None,
        "index": slot.index,
        "barber_sequence_index": slot.index,
        "index_label": format_ledger_index_label(
            LedgerEntryType.SERVICE,
            slot.index,
            year=label_year,
            month=label_month,
        ),
        "financial_year": label_year,
        "financial_month": label_month,
        "service_name": display_service,
        "employee_amount": employee_amt,
        "manager_amount": manager_amt,
        "amount": display_amount,
        "display_amount": display_amount,
        "employee": emp_side,
        "manager": mgr_side,
        "employee_label": (
            f"{emp_side['service_name']} — ₦{employee_amt}" if emp_side and employee_amt else None
        ),
        "manager_label": (
            f"{mgr_side['service_name']} — ₦{manager_amt}" if mgr_side and manager_amt else None
        ),
        "comparison_status": comparison,
        "reconciliation_status": recon_status,
        "reconciled_at": reconciled_at,
        "business_date": display_date,
        "occurred_at": display_occurred or datetime.now(UTC).isoformat(),
        "payment_method": display_payment,
        "note": display_note,
        "is_manager_created_without_barber": employee is None and manager is not None,
    }


def list_barber_month_reconciliation(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    year: int,
    month: int,
    page: int,
    page_size: int,
) -> tuple[list[dict[str, Any]], int]:
    slots = _slots_for_calendar_month(db, barber_user_id=barber_user_id, year=year, month=month)
    total = len(slots)
    page_slots = slots[(page - 1) * page_size : page * page_size]
    type_ids: set[uuid.UUID] = set()
    for s in page_slots:
        for row in (s.employee, s.manager):
            if row and row.service_type_id:
                type_ids.add(row.service_type_id)
    names = _service_type_names(db, type_ids)
    items = [
        build_comparison_payload(s, service_names=names, year=year, month=month)
        for s in page_slots
    ]
    attach_payment_method_adjustments(db, items)
    return items, total


def _service_type_names(db: Session, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    return {
        row.id: row.name
        for row in db.query(ServiceType).filter(ServiceType.id.in_(ids)).all()
    }


def list_barber_day_reconciliation(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    business_day: date,
    page: int,
    page_size: int,
) -> tuple[list[dict[str, Any]], int]:
    slots = _slots_for_business_day(db, barber_user_id=barber_user_id, business_day=business_day)
    slots.sort(key=lambda s: (s.index, _slot_sort_key(s)))
    total = len(slots)
    page_slots = slots[(page - 1) * page_size : page * page_size]
    type_ids: set[uuid.UUID] = set()
    for s in page_slots:
        for row in (s.employee, s.manager):
            if row and row.service_type_id:
                type_ids.add(row.service_type_id)
    names = _service_type_names(db, type_ids)
    month_ids = {s.financial_month_id for s in page_slots}
    financial_months = load_financial_months_map(db, month_ids)
    items = [
        build_comparison_payload(s, service_names=names, financial_months=financial_months)
        for s in page_slots
    ]
    attach_payment_method_adjustments(db, items)
    return items, total


# Backward-compatible aliases used by routers during transition
def list_barber_month_indexed_entries(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    year: int,
    month: int,
    page: int,
    page_size: int,
) -> tuple[list[dict[str, Any]], int]:
    return list_barber_month_reconciliation(
        db,
        barber_user_id=barber_user_id,
        year=year,
        month=month,
        page=page,
        page_size=page_size,
    )


def list_barber_day_entries(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    business_day: date,
    page: int,
    page_size: int,
) -> tuple[list[dict[str, Any]], int]:
    return list_barber_day_reconciliation(
        db,
        barber_user_id=barber_user_id,
        business_day=business_day,
        page=page,
        page_size=page_size,
    )


def create_manager_official_service_line(
    db: Session,
    *,
    manager: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    barber_user_id: uuid.UUID,
    occurred_at: datetime,
    service_type_id: uuid.UUID,
    amount: Decimal,
    payment_method: Any,
    note: str | None,
) -> LedgerEntry:
    """Record an independent manager reconciliation index (never mutates employee rows)."""
    if manager.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Managers or admins only.", code="FORBIDDEN")
    if amount <= 0:
        raise ValidationAppError("Amount must be positive.", code="INVALID_AMOUNT")

    catalog_service.assert_service_type_selectable(db, service_type_id)

    business_date = business_date_for_instant(occurred_at)
    fm = require_financial_month_for_new_entry(db, business_date, manager)
    idx = allocate_next_sequence_index(
        db,
        barber_user_id=barber_user_id,
        financial_month_id=fm.id,
        stream=LedgerRecordStream.MANAGER,
    )

    row = LedgerEntry(
        financial_month_id=fm.id,
        entry_type=LedgerEntryType.SERVICE,
        occurred_at=occurred_at,
        business_date=business_date,
        service_type_id=service_type_id,
        employee_user_id=barber_user_id,
        amount=amount,
        original_barber_amount=None,
        manager_approved_amount=None,
        barber_sequence_index=idx,
        record_stream=LedgerRecordStream.MANAGER,
        reconciliation_status=LedgerReconciliationStatus.PENDING,
        record_lifecycle=RecordLifecycleState.ACTIVE,
        payment_method=payment_method,
        note=note,
        created_by_user_id=manager.id,
        is_manager_created_without_barber=False,
    )
    db.add(row)
    db.flush()
    try_auto_match_for_service_row(db, row)
    audit_service.write_audit_log(
        db,
        actor_user_id=manager.id,
        impersonator_user_id=impersonator_id,
        action="ledger.manager_stream_create",
        entity_type="ledger_entry",
        entity_id=str(row.id),
        message=(
            f"Manager reconciliation "
            f"{format_ledger_index_label(LedgerEntryType.SERVICE, idx, year=fm.year, month=fm.month)} "
            f"for barber {barber_user_id}"
        ),
        payload={
            "barber_sequence_index": idx,
            "barber_user_id": str(barber_user_id),
            "record_stream": LedgerRecordStream.MANAGER,
        },
        ip_address=ip_address,
    )
    return row


def upsert_manager_row_for_employee_index(
    db: Session,
    *,
    manager: User,
    employee_row: LedgerEntry,
    amount: Decimal,
    summary_id: uuid.UUID | None = None,
) -> LedgerEntry:
    """Create or update the manager stream row at the employee's index (batch propose)."""
    if employee_row.barber_sequence_index is None:
        raise ValidationAppError("Employee row missing index.", code="LEDGER_DATA_ERROR")
    existing = find_manager_row_at_index(
        db,
        barber_user_id=employee_row.employee_user_id,  # type: ignore[arg-type]
        financial_month_id=employee_row.financial_month_id,
        index=employee_row.barber_sequence_index,
    )
    if existing:
        existing.amount = amount
        existing.reconciliation_status = LedgerReconciliationStatus.AWAITING_BARBER_REVIEW
        if summary_id:
            existing.barber_daily_summary_id = summary_id
        db.add(existing)
        db.flush()
        try_auto_match_for_service_row(db, existing)
        return existing

    occupied_index = employee_row.barber_sequence_index
    if _active_service_index_taken(
        db,
        barber_user_id=employee_row.employee_user_id,  # type: ignore[arg-type]
        financial_month_id=employee_row.financial_month_id,
        stream=LedgerRecordStream.MANAGER,
        index=occupied_index,
    ):
        raise ConflictError(
            "A manager record already exists for this index.",
            code="MANAGER_INDEX_COLLISION",
        )

    row = LedgerEntry(
        financial_month_id=employee_row.financial_month_id,
        entry_type=LedgerEntryType.SERVICE,
        occurred_at=employee_row.occurred_at,
        business_date=employee_row.business_date,
        service_type_id=employee_row.service_type_id,
        employee_user_id=employee_row.employee_user_id,
        amount=amount,
        barber_sequence_index=occupied_index,
        record_stream=LedgerRecordStream.MANAGER,
        reconciliation_status=LedgerReconciliationStatus.AWAITING_BARBER_REVIEW,
        record_lifecycle=RecordLifecycleState.ACTIVE,
        payment_method=employee_row.payment_method,
        note=employee_row.note,
        created_by_user_id=manager.id,
        barber_daily_summary_id=summary_id,
        is_manager_created_without_barber=False,
    )
    db.add(row)
    db.flush()
    ensure_sequence_counter_at_least(
        db,
        barber_user_id=employee_row.employee_user_id,  # type: ignore[arg-type]
        financial_month_id=employee_row.financial_month_id,
        stream=LedgerRecordStream.MANAGER,
        minimum_next_index=occupied_index + 1,
    )
    try_auto_match_for_service_row(db, row)
    return row


def match_pending_employee_entry(
    db: Session,
    *,
    manager: User,
    employee_entry_id: uuid.UUID,
    payment_method: Any,
) -> LedgerEntry:
    """
    Create the manager stream row at the employee's index (manual reconciliation match).

    Preserves index, employee, amount, and service type; manager supplies payment method.
    """
    if manager.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Managers or admins only.", code="FORBIDDEN")

    employee_row = db.get(LedgerEntry, employee_entry_id)
    if employee_row is None or employee_row.record_lifecycle != RecordLifecycleState.ACTIVE:
        raise NotFoundError("Entry not found.", code="LEDGER_NOT_FOUND")
    if employee_row.record_stream != LedgerRecordStream.EMPLOYEE:
        raise ValidationAppError(
            "Only employee stream entries can be matched this way.",
            code="LEDGER_WRONG_STREAM",
        )
    if employee_row.entry_type != LedgerEntryType.SERVICE:
        raise ValidationAppError("Only service entries reconcile.", code="LEDGER_WRONG_TYPE")

    existing_mgr = find_manager_row_at_index(
        db,
        barber_user_id=employee_row.employee_user_id,  # type: ignore[arg-type]
        financial_month_id=employee_row.financial_month_id,
        index=employee_row.barber_sequence_index,  # type: ignore[arg-type]
    )
    if existing_mgr is not None:
        raise ConflictError(
            "A manager record already exists for this index.",
            code="MANAGER_ROW_EXISTS",
        )

    mgr = upsert_manager_row_for_employee_index(
        db,
        manager=manager,
        employee_row=employee_row,
        amount=employee_row.amount,
        summary_id=None,
    )
    mgr.payment_method = payment_method
    mgr.reconciliation_status = LedgerReconciliationStatus.APPROVED
    mgr.approved_at = datetime.now(UTC)
    employee_row.reconciliation_status = LedgerReconciliationStatus.APPROVED
    employee_row.approved_at = datetime.now(UTC)
    db.add(mgr)
    db.add(employee_row)
    db.flush()

    audit_service.write_audit_log(
        db,
        actor_user_id=manager.id,
        impersonator_user_id=None,
        action="ledger.manual_match",
        entity_type="ledger_entry",
        entity_id=str(mgr.id),
        message=f"Matched employee index {index_label_for_entry(db, employee_row)}",
        payload={
            "employee_entry_id": str(employee_row.id),
            "barber_sequence_index": employee_row.barber_sequence_index,
        },
        ip_address=None,
    )
    return mgr


def match_all_pending_employee_entries(
    db: Session,
    *,
    manager: User,
    payment_method: Any,
    limit: int = 200,
) -> list[LedgerEntry]:
    """Match every employee-only pending index (shop-wide), up to ``limit`` rows."""
    if manager.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Managers or admins only.", code="FORBIDDEN")

    employee_rows = (
        _stream_filter(
            db.query(LedgerEntry).filter(
                LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
                LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            ),
            LedgerRecordStream.EMPLOYEE,
        )
        .order_by(LedgerEntry.occurred_at.desc())
        .limit(1000)
        .all()
    )
    comparison = comparison_status_map_for_rows(db, employee_rows)
    matched: list[LedgerEntry] = []
    seen: set[tuple[uuid.UUID, uuid.UUID, int]] = set()

    for row in employee_rows:
        if row.barber_sequence_index is None or row.employee_user_id is None:
            continue
        if comparison.get(row.id) != "missing_manager_entry":
            continue
        key = (row.employee_user_id, row.financial_month_id, row.barber_sequence_index)
        if key in seen:
            continue
        seen.add(key)
        mgr = match_pending_employee_entry(
            db,
            manager=manager,
            employee_entry_id=row.id,
            payment_method=payment_method,
        )
        matched.append(mgr)
        if len(matched) >= limit:
            break

    return matched


def list_reconciliation_inbox(
    db: Session,
    *,
    inbox_filter: str,
    limit: int = 200,
    page: int = 1,
    page_size: int | None = None,
    barber_user_id: uuid.UUID | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """
    Reconciliation inbox: one row per index slot.

    ``inbox_filter``: ``pending`` (one-sided) or ``mismatch`` (both sides, amounts differ).
    Manager perspective (default): shop-wide ``missing_manager_entry`` pending slots.
    Employee perspective (``barber_user_id`` set): barber-scoped ``missing_employee_entry``.
    """
    if inbox_filter not in {"pending", "mismatch"}:
        raise ValidationAppError("Invalid inbox filter.", code="INVALID_FILTER")

    target_pending = (
        {"missing_manager_entry"}
        if barber_user_id is None
        else {"missing_employee_entry"}
    )
    target_mismatch = {"mismatch"}

    query = db.query(LedgerEntry).filter(
        LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
        LedgerEntry.entry_type == LedgerEntryType.SERVICE,
        LedgerEntry.record_stream.isnot(None),
        LedgerEntry.barber_sequence_index.isnot(None),
        LedgerEntry.employee_user_id.isnot(None),
        # Pairing logic relies on financial_month_id + index; legacy rows missing it can
        # cause ambiguous lookups (MultipleResultsFound) and crash the inbox.
        LedgerEntry.financial_month_id.isnot(None),
    )
    if barber_user_id is not None:
        query = query.filter(LedgerEntry.employee_user_id == barber_user_id)

    service_rows = query.order_by(LedgerEntry.occurred_at.desc()).limit(1500).all()
    comparison = comparison_status_map_for_rows(db, service_rows)
    seen_slots: set[tuple[uuid.UUID, uuid.UUID, int]] = set()
    slots: list[ReconciliationSlot] = []

    for row in service_rows:
        if (
            row.barber_sequence_index is None
            or row.employee_user_id is None
            or row.financial_month_id is None
        ):
            continue
        slot_key = (row.employee_user_id, row.financial_month_id, row.barber_sequence_index)
        if slot_key in seen_slots:
            continue
        comp = comparison.get(row.id)
        if inbox_filter == "pending" and comp not in target_pending:
            continue
        if inbox_filter == "mismatch" and comp not in target_mismatch:
            continue
        seen_slots.add(slot_key)
        employee = find_employee_row_at_index(
            db,
            barber_user_id=row.employee_user_id,
            financial_month_id=row.financial_month_id,
            index=row.barber_sequence_index,
        )
        manager = find_manager_row_at_index(
            db,
            barber_user_id=row.employee_user_id,
            financial_month_id=row.financial_month_id,
            index=row.barber_sequence_index,
        )
        slots.append(
            ReconciliationSlot(
                financial_month_id=row.financial_month_id,
                index=row.barber_sequence_index,
                employee=employee,
                manager=manager,
            )
        )

    from sqlalchemy.orm import joinedload

    from app.models.user import User as UserModel

    total = len(slots)
    effective_page_size = page_size if page_size is not None else limit
    page_slots = slots[(page - 1) * effective_page_size : page * effective_page_size]

    type_ids: set[uuid.UUID] = set()
    for slot in page_slots:
        for side in (slot.employee, slot.manager):
            if side and side.service_type_id:
                type_ids.add(side.service_type_id)

    barber_ids = {
        (s.employee or s.manager).employee_user_id  # type: ignore[union-attr]
        for s in page_slots
        if s.employee or s.manager
    }
    users = (
        db.query(UserModel)
        .options(joinedload(UserModel.profile))
        .filter(UserModel.id.in_(barber_ids))
        .all()
        if barber_ids
        else []
    )
    user_labels: dict[uuid.UUID, str] = {}
    for u in users:
        if u.profile and u.profile.full_name:
            user_labels[u.id] = u.profile.full_name
        else:
            user_labels[u.id] = f"@{u.username}"

    names = _service_type_names(db, type_ids)
    month_ids = {s.financial_month_id for s in page_slots}
    financial_months = load_financial_months_map(db, month_ids)
    items: list[dict[str, Any]] = []
    for slot in page_slots:
        payload = build_comparison_payload(
            slot, service_names=names, financial_months=financial_months
        )
        primary = slot.employee or slot.manager
        barber_id = primary.employee_user_id if primary else None
        payload["employee_user_id"] = str(barber_id) if barber_id else None
        payload["employee_name"] = user_labels.get(barber_id) if barber_id else None
        payload["entry_type"] = "service"
        items.append(payload)
    attach_payment_method_adjustments(db, items)
    return items, total


def count_actionable_reconciliation(
    db: Session,
    *,
    perspective: str,
    barber_user_id: uuid.UUID | None = None,
) -> dict[str, int]:
    """
    Role-oriented pending/mismatch counts for navigation badges.

    ``perspective`` ``manager``: shop-wide ``missing_manager_entry`` slots.
    ``perspective`` ``employee``: barber-scoped ``missing_employee_entry`` slots.
    """
    if perspective not in {"manager", "employee"}:
        raise ValidationAppError("Invalid perspective.", code="INVALID_PERSPECTIVE")
    if perspective == "employee" and barber_user_id is None:
        raise ValidationAppError("barber_user_id required.", code="INVALID_REQUEST")

    pending_targets = (
        {"missing_manager_entry"}
        if perspective == "manager"
        else {"missing_employee_entry"}
    )
    target_mismatch = {"mismatch"}

    query = db.query(LedgerEntry).filter(
        LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
        LedgerEntry.entry_type == LedgerEntryType.SERVICE,
        LedgerEntry.record_stream.isnot(None),
        LedgerEntry.barber_sequence_index.isnot(None),
        LedgerEntry.employee_user_id.isnot(None),
        LedgerEntry.financial_month_id.isnot(None),
    )
    if perspective == "employee":
        query = query.filter(LedgerEntry.employee_user_id == barber_user_id)

    service_rows = query.order_by(LedgerEntry.occurred_at.desc()).limit(1500).all()
    comparison = comparison_status_map_for_rows(db, service_rows)

    seen_slots: set[tuple[uuid.UUID, uuid.UUID, int]] = set()
    pending = 0
    mismatch = 0

    for row in service_rows:
        if row.barber_sequence_index is None or row.employee_user_id is None:
            continue
        slot_key = (row.employee_user_id, row.financial_month_id, row.barber_sequence_index)
        if slot_key in seen_slots:
            continue
        comp = comparison.get(row.id)
        if comp in pending_targets:
            seen_slots.add(slot_key)
            pending += 1
        elif comp in target_mismatch:
            seen_slots.add(slot_key)
            mismatch += 1

    return {"pending": pending, "mismatch": mismatch}


def resolve_mismatch_use_employee_amount(
    db: Session,
    *,
    manager: User,
    employee_entry_id: uuid.UUID,
) -> tuple[LedgerEntry, LedgerEntry]:
    """Align manager stream amount to employee and auto-approve when matched."""
    if manager.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Managers or admins only.", code="FORBIDDEN")

    employee_row = db.get(LedgerEntry, employee_entry_id)
    if employee_row is None or employee_row.record_stream != LedgerRecordStream.EMPLOYEE:
        raise NotFoundError("Employee entry not found.", code="LEDGER_NOT_FOUND")

    mgr = find_manager_row_at_index(
        db,
        barber_user_id=employee_row.employee_user_id,  # type: ignore[arg-type]
        financial_month_id=employee_row.financial_month_id,
        index=employee_row.barber_sequence_index,  # type: ignore[arg-type]
    )
    if mgr is None:
        raise NotFoundError("Manager entry not found for this index.", code="MANAGER_ROW_MISSING")

    mgr.amount = employee_row.amount
    db.add(mgr)
    apply_auto_match_if_eligible(db, employee=employee_row, manager=mgr)
    db.flush()
    return employee_row, mgr


def list_pending_reconciliation_entries(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    business_day: date,
) -> list[LedgerEntry]:
    """Employee indexes on this day with no manager stream row at the same month+index."""
    employee_rows = (
        _stream_filter(_service_base_filter(db, barber_user_id=barber_user_id), LedgerRecordStream.EMPLOYEE)
        .filter(LedgerEntry.business_date == business_day)
        .order_by(LedgerEntry.barber_sequence_index.asc())
        .all()
    )
    pending: list[LedgerEntry] = []
    for row in employee_rows:
        if row.barber_sequence_index is None:
            continue
        mgr = find_manager_row_at_index(
            db,
            barber_user_id=barber_user_id,
            financial_month_id=row.financial_month_id,
            index=row.barber_sequence_index,
        )
        if mgr is None:
            pending.append(row)
    return pending


def create_barber_service_entry(
    db: Session,
    *,
    actor: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    occurred_at: datetime,
    service_type_id: uuid.UUID,
    amount: Decimal,
    note: str | None,
) -> LedgerEntry:
    if actor.role not in (UserRole.BARBER, UserRole.STAFF):
        raise ForbiddenError(
            "Only service providers can use this self-ledger endpoint.",
            code="NOT_SERVICE_PROVIDER",
        )
    if amount <= 0:
        raise ValidationAppError("Amount must be positive.", code="INVALID_AMOUNT")

    catalog_service.assert_service_type_selectable(db, service_type_id)

    business_date = business_date_for_instant(occurred_at)
    fm = require_financial_month_for_new_entry(db, business_date, actor)
    idx = allocate_next_sequence_index(
        db,
        barber_user_id=actor.id,
        financial_month_id=fm.id,
        stream=LedgerRecordStream.EMPLOYEE,
    )

    row = LedgerEntry(
        financial_month_id=fm.id,
        entry_type=LedgerEntryType.SERVICE,
        occurred_at=occurred_at,
        business_date=business_date,
        service_type_id=service_type_id,
        employee_user_id=actor.id,
        amount=amount,
        original_barber_amount=amount,
        manager_approved_amount=None,
        barber_sequence_index=idx,
        record_stream=LedgerRecordStream.EMPLOYEE,
        reconciliation_status=LedgerReconciliationStatus.PENDING,
        record_lifecycle=RecordLifecycleState.ACTIVE,
        payment_method=None,
        note=note,
        created_by_user_id=actor.id,
        is_manager_created_without_barber=False,
    )
    db.add(row)
    db.flush()
    try_auto_match_for_service_row(db, row)

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=impersonator_id,
        action="ledger.employee_stream_create",
        entity_type="ledger_entry",
        entity_id=str(row.id),
        message=(
            f"Employee service "
            f"{format_ledger_index_label(LedgerEntryType.SERVICE, idx, year=fm.year, month=fm.month)} "
            f"recorded for ₦{amount}"
        ),
        payload={
            "barber_sequence_index": idx,
            "business_date": str(business_date),
            "record_stream": LedgerRecordStream.EMPLOYEE,
        },
        ip_address=ip_address,
    )
    return row


def update_barber_service_entry(
    db: Session,
    *,
    actor: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    entry_id: uuid.UUID,
    amount: Decimal | None,
    service_type_id: uuid.UUID | None,
    note: str | None,
) -> LedgerEntry:
    if actor.role not in (UserRole.BARBER, UserRole.STAFF):
        raise ForbiddenError(
            "Only service providers may edit their own ledger.",
            code="NOT_SERVICE_PROVIDER",
        )
    row = db.get(LedgerEntry, entry_id)
    if row is None or row.record_lifecycle != RecordLifecycleState.ACTIVE:
        raise NotFoundError("Entry not found.", code="LEDGER_NOT_FOUND")
    if row.record_stream != LedgerRecordStream.EMPLOYEE:
        raise ForbiddenError("Only employee stream entries are editable here.", code="LEDGER_WRONG_STREAM")
    if row.employee_user_id != actor.id:
        raise ForbiddenError("Cannot edit another barber's records.", code="LEDGER_WRONG_BARBER")
    if row.entry_type != LedgerEntryType.SERVICE:
        raise ValidationAppError(
            "Only service entries are editable here.", code="LEDGER_WRONG_TYPE"
        )
    if row.reconciliation_status in {
        LedgerReconciliationStatus.SETTLED,
        LedgerReconciliationStatus.LOCKED,
    }:
        raise ConflictError("Approved or settled records cannot be edited.", code="LEDGER_LOCKED")

    require_writable_month_for_entry(
        db,
        financial_month_id=row.financial_month_id,
        actor=actor,
        grace_operational=False,
    )

    bd = row.business_date
    if bd is None:
        raise ValidationAppError("Entry missing business_date.", code="LEDGER_DATA_ERROR")
    if not barber_may_edit_entry(business_date=bd, now=datetime.now(UTC)):
        raise ConflictError(
            "Edits are locked after 21:00 on the business day.",
            code="BARBER_EDIT_CUTOFF",
        )

    if amount is not None:
        if amount <= 0:
            raise ValidationAppError("Amount must be positive.", code="INVALID_AMOUNT")
        old = row.amount
        row.amount = amount
        row.original_barber_amount = amount
        audit_service.write_audit_log(
            db,
            actor_user_id=actor.id,
            impersonator_user_id=impersonator_id,
            action="ledger.entry_edit",
            entity_type="ledger_entry",
            entity_id=str(row.id),
            message=f"Edited from ₦{old} → ₦{amount} by Barber",
            payload={"field": "amount", "from": str(old), "to": str(amount)},
            ip_address=ip_address,
        )
    if service_type_id is not None:
        catalog_service.assert_service_type_selectable(db, service_type_id)
        row.service_type_id = service_type_id
    if note is not None:
        row.note = note

    db.add(row)
    db.flush()
    try_auto_match_for_service_row(db, row)
    return row


def _user_display_label(db: Session, user_id: uuid.UUID | None) -> str | None:
    if not user_id:
        return None
    u = db.get(User, user_id)
    if u is None:
        return None
    if u.profile is not None and u.profile.full_name:
        return u.profile.full_name
    return f"@{u.username}"


def _assert_entry_mutable_for_void_or_edit(row: LedgerEntry) -> None:
    if row.record_lifecycle != RecordLifecycleState.ACTIVE:
        raise ConflictError("Record is already voided or purged.", code="LEDGER_NOT_ACTIVE")
    if row.reconciliation_status in {
        LedgerReconciliationStatus.SETTLED,
        LedgerReconciliationStatus.LOCKED,
    }:
        raise ConflictError(
            "Cannot modify settled or locked records.", code="LEDGER_LOCKED"
        )


def _serialize_payment_method_adjustment(
    db: Session,
    adj: LedgerPaymentMethodAdjustment,
) -> dict[str, Any]:
    return {
        "id": str(adj.id),
        "original_method": str(adj.original_method),
        "new_method": str(adj.new_method),
        "corrected_by_user_id": str(adj.corrected_by_user_id),
        "corrected_by_label": _user_display_label(db, adj.corrected_by_user_id),
        "reason": adj.reason,
        "created_at": adj.created_at.isoformat(),
    }


def payment_method_adjustments_for_entry(
    db: Session,
    ledger_entry_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = (
        db.query(LedgerPaymentMethodAdjustment)
        .filter(LedgerPaymentMethodAdjustment.ledger_entry_id == ledger_entry_id)
        .order_by(LedgerPaymentMethodAdjustment.created_at.asc())
        .all()
    )
    return [_serialize_payment_method_adjustment(db, r) for r in rows]


def payment_method_adjustments_map_for_entries(
    db: Session,
    ledger_entry_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[dict[str, Any]]]:
    if not ledger_entry_ids:
        return {}
    rows = (
        db.query(LedgerPaymentMethodAdjustment)
        .filter(LedgerPaymentMethodAdjustment.ledger_entry_id.in_(ledger_entry_ids))
        .order_by(LedgerPaymentMethodAdjustment.created_at.asc())
        .all()
    )
    result: dict[uuid.UUID, list[dict[str, Any]]] = {eid: [] for eid in ledger_entry_ids}
    for adj in rows:
        result.setdefault(adj.ledger_entry_id, []).append(
            _serialize_payment_method_adjustment(db, adj)
        )
    return result


def attach_payment_method_adjustments(db: Session, items: list[dict[str, Any]]) -> None:
    """Attach correction audit trails to reconciliation workspace payloads."""
    mgr_ids: list[uuid.UUID] = []
    for item in items:
        raw = item.get("manager_entry_id")
        if raw:
            mgr_ids.append(uuid.UUID(str(raw)))
    if not mgr_ids:
        for item in items:
            item["payment_method_adjustments"] = []
        return
    adj_map = payment_method_adjustments_map_for_entries(db, mgr_ids)
    for item in items:
        raw = item.get("manager_entry_id")
        if raw:
            item["payment_method_adjustments"] = adj_map.get(uuid.UUID(str(raw)), [])
        else:
            item["payment_method_adjustments"] = []


def _resolve_manager_row_for_payment_correction(
    db: Session,
    entry: LedgerEntry,
) -> LedgerEntry:
    if entry.record_stream == LedgerRecordStream.MANAGER:
        return entry
    if entry.record_stream != LedgerRecordStream.EMPLOYEE:
        raise ValidationAppError(
            "Only service stream entries can be corrected.",
            code="LEDGER_WRONG_STREAM",
        )
    if entry.barber_sequence_index is None or entry.employee_user_id is None:
        raise ValidationAppError("Entry missing index.", code="LEDGER_DATA_ERROR")
    manager = find_manager_row_at_index(
        db,
        barber_user_id=entry.employee_user_id,
        financial_month_id=entry.financial_month_id,
        index=entry.barber_sequence_index,
    )
    if manager is None:
        raise ValidationAppError(
            "No manager record exists for this service index.",
            code="MANAGER_ROW_MISSING",
        )
    return manager


def correct_matched_service_payment_method(
    db: Session,
    *,
    actor: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    entry_id: uuid.UUID,
    new_payment_method: PaymentMethod,
    reason: str,
) -> LedgerEntry:
    """
    Reallocate a matched service between cash/transfer/POS without changing revenue.

    Only the manager-stream payment_method is updated; amount and commission inputs stay put.
    """
    if actor.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Managers or admins only.", code="FORBIDDEN")

    entry = db.get(LedgerEntry, entry_id)
    if entry is None:
        raise NotFoundError("Entry not found.", code="LEDGER_NOT_FOUND")
    if entry.entry_type != LedgerEntryType.SERVICE:
        raise ValidationAppError(
            "Payment method correction applies to service entries only.",
            code="LEDGER_WRONG_TYPE",
        )

    manager_row = _resolve_manager_row_for_payment_correction(db, entry)
    _assert_entry_mutable_for_void_or_edit(manager_row)
    if _has_pending_void(manager_row):
        raise ConflictError(
            "Cannot correct payment method while void is pending.",
            code="LEDGER_PENDING_VOID",
        )

    employee, manager = paired_rows_for_service(db, manager_row)
    comparison = _pair_reconciliation_status(employee, manager)
    if comparison != "matched":
        raise ValidationAppError(
            "Only matched service records can have payment methods corrected.",
            code="NOT_MATCHED",
        )

    current = manager_row.payment_method
    if current not in _SERVICE_PAYMENT_METHODS:
        raise ValidationAppError(
            "This record has no correctable payment method.",
            code="PAYMENT_METHOD_NOT_SET",
        )
    if new_payment_method not in _SERVICE_PAYMENT_METHODS:
        raise ValidationAppError(
            "Payment method must be cash, transfer, or POS.",
            code="INVALID_PAYMENT_METHOD",
        )
    if new_payment_method == current:
        raise ValidationAppError(
            "New payment method must differ from the current method.",
            code="PAYMENT_METHOD_UNCHANGED",
        )

    require_writable_month_for_entry(
        db,
        financial_month_id=manager_row.financial_month_id,
        actor=actor,
        grace_operational=True,
    )

    trimmed_reason = reason.strip()
    if not trimmed_reason:
        raise ValidationAppError("Reason is required.", code="REASON_REQUIRED")

    adjustment = LedgerPaymentMethodAdjustment(
        ledger_entry_id=manager_row.id,
        original_method=current,
        new_method=new_payment_method,
        corrected_by_user_id=actor.id,
        reason=trimmed_reason,
    )
    manager_row.payment_method = new_payment_method
    db.add(adjustment)
    db.add(manager_row)
    db.flush()

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=impersonator_id,
        action="ledger.payment_method_corrected",
        entity_type="ledger_entry",
        entity_id=str(manager_row.id),
        message=f"Payment method {current} → {new_payment_method}",
        payload={
            "original_method": str(current),
            "new_method": str(new_payment_method),
            "reason": trimmed_reason,
            "adjustment_id": str(adjustment.id),
        },
        ip_address=ip_address,
    )
    return manager_row


def _void_active_service_pair(
    db: Session,
    *,
    anchor_row: LedgerEntry,
    actor: User,
    reason: str,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
) -> LedgerEntry:
    """Void every active stream row at the same service index (employee + manager)."""
    employee, manager = paired_rows_for_service(db, anchor_row)
    targets: list[LedgerEntry] = []
    for candidate in (employee, manager):
        if candidate is not None and candidate.record_lifecycle == RecordLifecycleState.ACTIVE:
            targets.append(candidate)
    if not targets:
        if anchor_row.record_lifecycle == RecordLifecycleState.ACTIVE:
            targets = [anchor_row]
        else:
            raise ConflictError("Record is already voided or purged.", code="LEDGER_NOT_ACTIVE")

    for target in targets:
        _finalize_void(
            db,
            row=target,
            actor=actor,
            reason=reason,
            impersonator_id=impersonator_id,
            ip_address=ip_address,
        )
    db.flush()
    _refresh_daily_summary_after_service_void(db, anchor_row)
    return anchor_row if anchor_row in targets else targets[0]


def _refresh_daily_summary_after_service_void(db: Session, row: LedgerEntry) -> None:
    if row.entry_type != LedgerEntryType.SERVICE:
        return
    if row.business_date is None or row.employee_user_id is None:
        return
    from app.services import reconciliation_service

    reconciliation_service.refresh_daily_summary_totals_from_ledger(
        db,
        barber_user_id=row.employee_user_id,
        business_day=row.business_date,
    )


def _finalize_void(
    db: Session,
    *,
    row: LedgerEntry,
    actor: User,
    reason: str,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
) -> None:
    now = datetime.now(UTC)
    row.record_lifecycle = RecordLifecycleState.DELETED
    row.deleted_at = now
    row.deleted_by_user_id = actor.id
    row.void_reason = reason.strip()
    row.pending_void_reason = None
    row.pending_void_by_user_id = None
    row.pending_void_requested_at = None
    if row.reconciliation_status == LedgerReconciliationStatus.PENDING_DELETE_CONFIRMATION:
        row.reconciliation_status = LedgerReconciliationStatus.ADJUSTED
    db.add(row)
    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=impersonator_id,
        action="ledger.entry_voided",
        entity_type="ledger_entry",
        entity_id=str(row.id),
        message=f"Voided: {reason.strip()}",
        payload={"void_reason": reason.strip()},
        ip_address=ip_address,
    )


def void_ledger_entry(
    db: Session,
    *,
    actor: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    entry_id: uuid.UUID,
    reason: str,
) -> LedgerEntry:
    """Void a ledger entry. Never hard-deletes — preserves index continuity."""
    if not reason.strip():
        raise ValidationAppError("Void reason is required.", code="VOID_REASON_REQUIRED")

    row = db.get(LedgerEntry, entry_id)
    if row is None:
        raise NotFoundError("Entry not found.", code="LEDGER_NOT_FOUND")
    _assert_entry_mutable_for_void_or_edit(row)

    grace_ops = actor.role in {UserRole.MANAGER, UserRole.ADMIN}
    require_writable_month_for_entry(
        db,
        financial_month_id=row.financial_month_id,
        actor=actor,
        grace_operational=grace_ops,
    )

    if actor.role in (UserRole.BARBER, UserRole.STAFF):
        return _void_by_service_provider(
            db,
            actor=actor,
            row=row,
            reason=reason,
            impersonator_id=impersonator_id,
            ip_address=ip_address,
        )

    if actor.role in {UserRole.MANAGER, UserRole.ADMIN}:
        return _void_by_manager(
            db,
            actor=actor,
            row=row,
            reason=reason,
            impersonator_id=impersonator_id,
            ip_address=ip_address,
        )

    raise ForbiddenError("Insufficient permissions.", code="FORBIDDEN")


def _void_by_service_provider(
    db: Session,
    *,
    actor: User,
    row: LedgerEntry,
    reason: str,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
) -> LedgerEntry:
    if row.record_stream != LedgerRecordStream.EMPLOYEE:
        raise ForbiddenError("Providers may only void employee stream entries.", code="FORBIDDEN")
    if row.employee_user_id != actor.id:
        raise ForbiddenError("Cannot void another provider's records.", code="LEDGER_WRONG_EMPLOYEE")
    if row.entry_type != LedgerEntryType.SERVICE:
        raise ValidationAppError("Providers may only void service entries.", code="LEDGER_WRONG_TYPE")

    bd = row.business_date
    if bd is None:
        raise ValidationAppError("Entry missing business_date.", code="LEDGER_DATA_ERROR")
    if not barber_may_edit_entry(business_date=bd, now=datetime.now(UTC)):
        raise ConflictError(
            "Voids are locked after 21:00 on the business day.",
            code="BARBER_EDIT_CUTOFF",
        )

    _void_active_service_pair(
        db,
        anchor_row=row,
        actor=actor,
        reason=reason,
        impersonator_id=impersonator_id,
        ip_address=ip_address,
    )
    return row


def _void_by_manager(
    db: Session,
    *,
    actor: User,
    row: LedgerEntry,
    reason: str,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
) -> LedgerEntry:
    """Sales/expenses void immediately. Service voids may require employee confirmation."""
    if row.entry_type in (LedgerEntryType.SALE, LedgerEntryType.EXPENSE):
        _finalize_void(
            db,
            row=row,
            actor=actor,
            reason=reason,
            impersonator_id=impersonator_id,
            ip_address=ip_address,
        )
        if row.entry_type == LedgerEntryType.SALE:
            from app.services import inventory_service

            inventory_service.restore_stock_for_voided_sale(db, ledger_entry=row, actor=actor)
        db.flush()
        return row

    if row.entry_type != LedgerEntryType.SERVICE:
        raise ValidationAppError("Unsupported entry type.", code="LEDGER_WRONG_TYPE")

    employee, manager = paired_rows_for_service(db, row)
    employee_row = employee if employee is not None else (
        row if row.record_stream == LedgerRecordStream.EMPLOYEE else None
    )

    if employee_row is None:
        _void_active_service_pair(
            db,
            anchor_row=row,
            actor=actor,
            reason=reason,
            impersonator_id=impersonator_id,
            ip_address=ip_address,
        )
        return row

    if employee_row.employee_user_id is None:
        _void_active_service_pair(
            db,
            anchor_row=employee_row,
            actor=actor,
            reason=reason,
            impersonator_id=impersonator_id,
            ip_address=ip_address,
        )
        return employee_row

    now = datetime.now(UTC)
    employee_row.pending_void_reason = reason.strip()
    employee_row.pending_void_by_user_id = actor.id
    employee_row.pending_void_requested_at = now
    employee_row.reconciliation_status = LedgerReconciliationStatus.PENDING_DELETE_CONFIRMATION
    db.add(employee_row)
    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=impersonator_id,
        action="ledger.entry_void_requested",
        entity_type="ledger_entry",
        entity_id=str(employee_row.id),
        message=f"Void requested: {reason.strip()}",
        payload={"void_reason": reason.strip()},
        ip_address=ip_address,
    )
    db.flush()
    return employee_row


def accept_pending_void(
    db: Session,
    *,
    actor: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    entry_id: uuid.UUID,
) -> LedgerEntry:
    """Employee accepts a manager-initiated void request."""
    row = db.get(LedgerEntry, entry_id)
    if row is None or row.record_stream != LedgerRecordStream.EMPLOYEE:
        raise NotFoundError("Entry not found.", code="LEDGER_NOT_FOUND")
    if row.employee_user_id != actor.id:
        raise ForbiddenError("Cannot accept void for another employee.", code="FORBIDDEN")
    if row.reconciliation_status != LedgerReconciliationStatus.PENDING_DELETE_CONFIRMATION:
        raise ConflictError("No pending void request on this record.", code="NO_PENDING_VOID")
    if not row.pending_void_reason:
        raise ConflictError("No pending void request on this record.", code="NO_PENDING_VOID")

    reason = row.pending_void_reason
    _void_active_service_pair(
        db,
        anchor_row=row,
        actor=actor,
        reason=reason,
        impersonator_id=impersonator_id,
        ip_address=ip_address,
    )
    return row


def list_pending_void_requests(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Pending manager void requests awaiting employee confirmation."""
    rows = (
        _stream_filter(
            _service_base_filter(db, barber_user_id=barber_user_id, include_voided=False),
            LedgerRecordStream.EMPLOYEE,
        )
        .filter(
            LedgerEntry.reconciliation_status
            == LedgerReconciliationStatus.PENDING_DELETE_CONFIRMATION
        )
        .order_by(LedgerEntry.pending_void_requested_at.desc())
        .all()
    )
    type_ids = {r.service_type_id for r in rows if r.service_type_id}
    names = _service_type_names(db, type_ids)
    financial_months = load_financial_months_map(
        db, {r.financial_month_id for r in rows}
    )
    items: list[dict[str, Any]] = []
    for row in rows:
        mgr = find_manager_row_at_index(
            db,
            barber_user_id=barber_user_id,
            financial_month_id=row.financial_month_id,
            index=row.barber_sequence_index,  # type: ignore[arg-type]
        )
        fm = financial_months.get(row.financial_month_id)
        items.append(
            {
                "entry_id": str(row.id),
                "index": row.barber_sequence_index,
                "index_label": format_ledger_index_label(
                    LedgerEntryType.SERVICE,
                    row.barber_sequence_index,
                    year=fm.year if fm else None,
                    month=fm.month if fm else None,
                ),
                "service_name": names.get(row.service_type_id, "Service")
                if row.service_type_id
                else "Service",
                "amount": str(row.amount),
                "manager_amount": str(mgr.amount) if mgr else None,
                "pending_void_reason": row.pending_void_reason,
                "pending_void_by_user_id": (
                    str(row.pending_void_by_user_id) if row.pending_void_by_user_id else None
                ),
                "pending_void_by_label": _user_display_label(db, row.pending_void_by_user_id),
                "pending_void_requested_at": (
                    row.pending_void_requested_at.isoformat()
                    if row.pending_void_requested_at
                    else None
                ),
                "business_date": row.business_date.isoformat() if row.business_date else None,
            }
        )
    return items


def update_manager_ledger_entry(
    db: Session,
    *,
    actor: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    entry_id: uuid.UUID,
    amount: Decimal | None,
    service_type_id: uuid.UUID | None,
    sale_category_id: uuid.UUID | None,
    expense_category_id: uuid.UUID | None,
    note: str | None,
) -> LedgerEntry:
    if actor.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Managers or admins only.", code="FORBIDDEN")

    row = db.get(LedgerEntry, entry_id)
    if row is None:
        raise NotFoundError("Entry not found.", code="LEDGER_NOT_FOUND")
    _assert_entry_mutable_for_void_or_edit(row)

    require_writable_month_for_entry(
        db,
        financial_month_id=row.financial_month_id,
        actor=actor,
        grace_operational=True,
    )

    if amount is not None:
        if amount <= 0:
            raise ValidationAppError("Amount must be positive.", code="INVALID_AMOUNT")
        old = row.amount
        row.amount = amount
        audit_service.write_audit_log(
            db,
            actor_user_id=actor.id,
            impersonator_user_id=impersonator_id,
            action="ledger.entry_edit",
            entity_type="ledger_entry",
            entity_id=str(row.id),
            message=f"Edited from ₦{old} → ₦{amount}",
            payload={"field": "amount", "from": str(old), "to": str(amount)},
            ip_address=ip_address,
        )

    if row.entry_type == LedgerEntryType.SERVICE:
        if service_type_id is not None:
            catalog_service.assert_service_type_selectable(db, service_type_id)
            row.service_type_id = service_type_id
    elif row.entry_type == LedgerEntryType.SALE:
        if sale_category_id is not None:
            catalog_service.assert_sale_category_selectable(db, sale_category_id)
            row.sale_category_id = sale_category_id
    elif row.entry_type == LedgerEntryType.EXPENSE:
        if expense_category_id is not None:
            catalog_service.assert_expense_category_selectable(db, expense_category_id)
            row.expense_category_id = expense_category_id

    if note is not None:
        row.note = note

    db.add(row)
    db.flush()
    if row.entry_type == LedgerEntryType.SERVICE:
        try_auto_match_for_service_row(db, row)
    return row


def soft_delete_barber_entry(
    db: Session,
    *,
    actor: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    entry_id: uuid.UUID,
    reason: str = "Voided",
) -> None:
    """Backward-compatible alias — always voids with a reason."""
    void_ledger_entry(
        db,
        actor=actor,
        impersonator_id=impersonator_id,
        ip_address=ip_address,
        entry_id=entry_id,
        reason=reason,
    )


def ledger_entry_void_metadata(db: Session, row: LedgerEntry) -> dict[str, Any]:
    """Serialize void/pending-void fields for API responses."""
    return {
        "record_lifecycle": str(row.record_lifecycle),
        "is_voided": _is_voided(row),
        "void_reason": row.void_reason,
        "voided_at": row.deleted_at.isoformat() if row.deleted_at else None,
        "voided_by_user_id": str(row.deleted_by_user_id) if row.deleted_by_user_id else None,
        "voided_by_label": _user_display_label(db, row.deleted_by_user_id),
        "pending_void_reason": row.pending_void_reason,
        "pending_void_by_user_id": (
            str(row.pending_void_by_user_id) if row.pending_void_by_user_id else None
        ),
        "pending_void_by_label": _user_display_label(db, row.pending_void_by_user_id),
        "pending_void_requested_at": (
            row.pending_void_requested_at.isoformat() if row.pending_void_requested_at else None
        ),
        "original_amount": (
            str(row.original_barber_amount)
            if row.original_barber_amount is not None
            else None
        ),
    }


def purge_entry_admin(
    db: Session,
    *,
    admin: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    entry_id: uuid.UUID,
    reason: str,
) -> None:
    if admin.role != UserRole.ADMIN:
        raise ForbiddenError("Only admins may purge.", code="ADMIN_ONLY")
    if not reason.strip():
        raise ValidationAppError("Purge reason is required.", code="PURGE_REASON_REQUIRED")
    row = db.get(LedgerEntry, entry_id)
    if row is None:
        raise NotFoundError("Entry not found.", code="LEDGER_NOT_FOUND")
    row.record_lifecycle = RecordLifecycleState.PURGED
    row.purged_at = datetime.now(UTC)
    row.purged_by_user_id = admin.id
    row.purge_reason = reason.strip()
    db.add(row)
    audit_service.write_audit_log(
        db,
        actor_user_id=admin.id,
        impersonator_user_id=impersonator_id,
        action="ledger.entry_purge",
        entity_type="ledger_entry",
        entity_id=str(row.id),
        message=f"Purged: {reason}",
        ip_address=ip_address,
    )


def barber_month_revenue_buckets(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    year: int,
    month: int,
) -> dict[str, Decimal | list[int] | list[str | None]]:
    """
    Month posture buckets from the centralized index reconciliation engine.

    - pending_total: one-sided indexes (employee or manager record missing)
    - approved_total: both sides present with matching amounts
    - mismatch_indexes: both sides present but amounts differ (no monetary total)
    """
    slots = _slots_for_calendar_month(
        db, barber_user_id=barber_user_id, year=year, month=month
    )
    pending = Decimal(0)
    approved = Decimal(0)
    mismatch_indexes: list[int] = []

    for slot in slots:
        comparison = _pair_reconciliation_status(slot.employee, slot.manager)
        if comparison in _FINANCIALLY_EXCLUDED_COMPARISONS:
            continue
        if comparison in {"missing_employee_entry", "missing_manager_entry"}:
            row = slot.employee or slot.manager
            if row is not None and not _is_voided(row):
                pending += row.amount
        elif comparison == "mismatch":
            mismatch_indexes.append(slot.index)
        elif comparison == "matched":
            row = slot.employee or slot.manager
            if row is not None and not _is_voided(row):
                approved += row.amount

    return {
        "pending_total": pending,
        "approved_total": approved,
        "mismatch_indexes": sorted(mismatch_indexes),
        "mismatch_index_labels": [
            format_ledger_index_label(
                LedgerEntryType.SERVICE, idx, year=year, month=month
            )
            for idx in sorted(mismatch_indexes)
        ],
    }


def barber_month_gross_recorded(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    year: int,
    month: int,
) -> Decimal:
    val = (
        db.query(func.coalesce(func.sum(LedgerEntry.amount), 0))
        .filter(
            LedgerEntry.employee_user_id == barber_user_id,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            LedgerEntry.record_stream == LedgerRecordStream.EMPLOYEE,
            extract("year", LedgerEntry.business_date) == year,
            extract("month", LedgerEntry.business_date) == month,
        )
        .scalar()
    )
    return Decimal(val or 0)


def _barber_service_entries_filter(db: Session, *, barber_user_id: uuid.UUID):
    return _stream_filter(
        _service_base_filter(db, barber_user_id=barber_user_id),
        LedgerRecordStream.EMPLOYEE,
    )


_SHOP_OPERATIONAL_ENTRY_TYPES = (
    LedgerEntryType.SERVICE,
    LedgerEntryType.SALE,
    LedgerEntryType.EXPENSE,
)


def _active_operational_ledger_filter():
    return (
        LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
        LedgerEntry.entry_type.in_(_SHOP_OPERATIONAL_ENTRY_TYPES),
    )


def first_operational_occurred_at(db: Session) -> datetime | None:
    """Earliest posted service, sale, or expense — start of real accounting history."""
    return (
        db.query(func.min(LedgerEntry.occurred_at))
        .filter(*_active_operational_ledger_filter())
        .scalar()
    )


def shop_operational_month_keys(db: Session) -> list[tuple[int, int]]:
    """Distinct (year, month) pairs with active services, sales, or expenses."""
    base_filter = _active_operational_ledger_filter()

    fm_pairs = (
        db.query(FinancialMonth.year, FinancialMonth.month)
        .join(LedgerEntry, LedgerEntry.financial_month_id == FinancialMonth.id)
        .filter(*base_filter)
        .distinct()
        .all()
    )

    bd_pairs = (
        db.query(
            extract("year", LedgerEntry.business_date),
            extract("month", LedgerEntry.business_date),
        )
        .filter(*base_filter, LedgerEntry.business_date.isnot(None))
        .distinct()
        .all()
    )

    seen: set[tuple[int, int]] = set()
    ordered: list[tuple[int, int]] = []
    for y, m in (*fm_pairs, *bd_pairs):
        if y is None or m is None:
            continue
        key = (int(y), int(m))
        if key not in seen:
            seen.add(key)
            ordered.append(key)

    ordered.sort()
    return ordered


def operational_months_in_range(
    db: Session,
    *,
    start: datetime,
    end: datetime,
) -> list[tuple[int, int]]:
    """Operational months whose calendar month overlaps [start, end]."""
    start_pair = (start.year, start.month)
    end_pair = (end.year, end.month)
    return [
        (year, month)
        for year, month in shop_operational_month_keys(db)
        if start_pair <= (year, month) <= end_pair
    ]


def barber_operational_month_keys(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
) -> list[tuple[int, int]]:
    """Distinct (year, month) pairs with active service entries on either stream."""
    service_filter = (
        LedgerEntry.employee_user_id == barber_user_id,
        LedgerEntry.entry_type == LedgerEntryType.SERVICE,
        LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
        LedgerEntry.record_stream.in_(
            [LedgerRecordStream.EMPLOYEE, LedgerRecordStream.MANAGER]
        ),
    )

    fm_pairs = (
        db.query(FinancialMonth.year, FinancialMonth.month)
        .join(LedgerEntry, LedgerEntry.financial_month_id == FinancialMonth.id)
        .filter(*service_filter)
        .distinct()
        .all()
    )

    bd_pairs = (
        db.query(
            extract("year", LedgerEntry.business_date),
            extract("month", LedgerEntry.business_date),
        )
        .filter(*service_filter, LedgerEntry.business_date.isnot(None))
        .distinct()
        .all()
    )

    seen: set[tuple[int, int]] = set()
    ordered: list[tuple[int, int]] = []
    for y, m in (*fm_pairs, *bd_pairs):
        if y is None or m is None:
            continue
        key = (int(y), int(m))
        if key not in seen:
            seen.add(key)
            ordered.append(key)

    ordered.sort(reverse=True)
    return ordered


def barber_month_services_count(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    year: int,
    month: int,
) -> int:
    val = (
        _barber_service_entries_filter(db, barber_user_id=barber_user_id)
        .filter(
            extract("year", LedgerEntry.business_date) == year,
            extract("month", LedgerEntry.business_date) == month,
        )
        .count()
    )
    return int(val or 0)


def barber_all_time_gross_recorded(db: Session, *, barber_user_id: uuid.UUID) -> Decimal:
    val = (
        _barber_service_entries_filter(db, barber_user_id=barber_user_id)
        .with_entities(func.coalesce(func.sum(LedgerEntry.amount), 0))
        .scalar()
    )
    return Decimal(val or 0)


def barber_all_time_services_count(db: Session, *, barber_user_id: uuid.UUID) -> int:
    val = _barber_service_entries_filter(db, barber_user_id=barber_user_id).count()
    return int(val or 0)


def compute_index_reconciliation_issues(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    business_day: date,
) -> dict[str, Any]:
    """Detect duplicate indexes per stream and amount deltas at paired positions."""
    slots = _slots_for_business_day(db, barber_user_id=barber_user_id, business_day=business_day)

    employee_rows = (
        _stream_filter(_service_base_filter(db, barber_user_id=barber_user_id), LedgerRecordStream.EMPLOYEE)
        .filter(LedgerEntry.business_date == business_day)
        .all()
    )
    manager_rows = (
        _stream_filter(_service_base_filter(db, barber_user_id=barber_user_id), LedgerRecordStream.MANAGER)
        .filter(LedgerEntry.business_date == business_day)
        .all()
    )

    def _duplicates(rows: list[LedgerEntry]) -> list[int]:
        by_slot: dict[tuple[uuid.UUID, int], int] = {}
        for r in rows:
            if r.barber_sequence_index is None or r.financial_month_id is None:
                continue
            key = (r.financial_month_id, r.barber_sequence_index)
            by_slot[key] = by_slot.get(key, 0) + 1
        return sorted(idx for (_, idx), count in by_slot.items() if count > 1)

    mismatches: list[dict[str, Any]] = []
    missing_manager_indexes: list[int] = []
    missing_employee_indexes: list[int] = []

    for slot in slots:
        if slot.employee and slot.manager:
            if slot.employee.amount != slot.manager.amount:
                mismatches.append(
                    {
                        "index": slot.index,
                        "employee_entry_id": str(slot.employee.id),
                        "manager_entry_id": str(slot.manager.id),
                        "employee_amount": str(slot.employee.amount),
                        "manager_amount": str(slot.manager.amount),
                    }
                )
        elif slot.employee and not slot.manager:
            missing_manager_indexes.append(slot.index)
        elif slot.manager and not slot.employee:
            missing_employee_indexes.append(slot.index)

    return {
        "duplicate_indexes": _duplicates(employee_rows) + _duplicates(manager_rows),
        "amount_mismatches": mismatches,
        "indexes_present": sorted({s.index for s in slots}),
        "missing_manager_indexes": sorted(missing_manager_indexes),
        "missing_employee_indexes": sorted(missing_employee_indexes),
    }


def list_manager_official_timeline(
    db: Session,
    *,
    limit: int = 200,
) -> list[LedgerEntry]:
    """Operational timeline for admin/manager: manager stream services plus sales/expenses."""
    return (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.record_lifecycle.in_(
                (RecordLifecycleState.ACTIVE, RecordLifecycleState.DELETED)
            ),
            or_(
                LedgerEntry.entry_type != LedgerEntryType.SERVICE,
                LedgerEntry.record_stream == LedgerRecordStream.MANAGER,
            ),
        )
        .order_by(LedgerEntry.occurred_at.desc())
        .limit(limit)
        .all()
    )


def _manager_timeline_base_filter():
    return and_(
        LedgerEntry.record_lifecycle.in_(
            (RecordLifecycleState.ACTIVE, RecordLifecycleState.DELETED)
        ),
        or_(
            LedgerEntry.entry_type != LedgerEntryType.SERVICE,
            LedgerEntry.record_stream == LedgerRecordStream.MANAGER,
        ),
    )


def list_manager_official_timeline_for_day(
    db: Session,
    *,
    business_day: date,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[LedgerEntry], int]:
    """Manager operational timeline scoped to a single business day."""
    base = db.query(LedgerEntry).filter(
        _manager_timeline_base_filter(),
        LedgerEntry.business_date == business_day,
    )
    total = base.count()
    rows = (
        base.order_by(LedgerEntry.occurred_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return rows, total


def day_employee_stream_entries(
    db: Session, barber_user_id: uuid.UUID, business_day: date
) -> list[LedgerEntry]:
    return (
        _stream_filter(_service_base_filter(db, barber_user_id=barber_user_id), LedgerRecordStream.EMPLOYEE)
        .filter(LedgerEntry.business_date == business_day)
        .order_by(LedgerEntry.barber_sequence_index.asc())
        .all()
    )


def day_manager_stream_entries(
    db: Session, barber_user_id: uuid.UUID, business_day: date
) -> list[LedgerEntry]:
    return (
        _stream_filter(_service_base_filter(db, barber_user_id=barber_user_id), LedgerRecordStream.MANAGER)
        .filter(LedgerEntry.business_date == business_day)
        .order_by(LedgerEntry.barber_sequence_index.asc())
        .all()
    )


@dataclass(frozen=True)
class ManagerIndexCollisionReport:
    """Duplicate active manager indexes within one employee+month scope."""

    barber_user_id: uuid.UUID
    employee_name: str | None
    financial_month_id: uuid.UUID
    financial_year: int | None
    financial_month: int | None
    duplicate_index: int
    index_label: str | None
    affected_records: tuple[dict[str, Any], ...]


def _manager_collision_groups(db: Session) -> list[tuple[uuid.UUID, uuid.UUID, int, list[LedgerEntry]]]:
    dup_keys = (
        db.query(
            LedgerEntry.employee_user_id,
            LedgerEntry.financial_month_id,
            LedgerEntry.barber_sequence_index,
            func.count(LedgerEntry.id),
        )
        .filter(
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_stream == LedgerRecordStream.MANAGER,
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            LedgerEntry.employee_user_id.isnot(None),
            LedgerEntry.financial_month_id.isnot(None),
            LedgerEntry.barber_sequence_index.isnot(None),
        )
        .group_by(
            LedgerEntry.employee_user_id,
            LedgerEntry.financial_month_id,
            LedgerEntry.barber_sequence_index,
        )
        .having(func.count(LedgerEntry.id) > 1)
        .all()
    )
    groups: list[tuple[uuid.UUID, uuid.UUID, int, list[LedgerEntry]]] = []
    for barber_id, fm_id, index, _count in dup_keys:
        rows = (
            _stream_filter(
                _service_base_filter(db, barber_user_id=barber_id),
                LedgerRecordStream.MANAGER,
            )
            .filter(
                LedgerEntry.financial_month_id == fm_id,
                LedgerEntry.barber_sequence_index == index,
            )
            .order_by(LedgerEntry.created_at.asc(), LedgerEntry.id.asc())
            .all()
        )
        if len(rows) > 1:
            groups.append((barber_id, fm_id, index, rows))
    return groups


def _collision_record_payload(row: LedgerEntry) -> dict[str, Any]:
    return {
        "entry_id": str(row.id),
        "amount": str(row.amount),
        "reconciliation_status": str(row.reconciliation_status) if row.reconciliation_status else None,
        "occurred_at": row.occurred_at.isoformat(),
        "created_at": row.created_at.isoformat(),
        "approved_at": row.approved_at.isoformat() if row.approved_at else None,
        "business_date": row.business_date.isoformat() if row.business_date else None,
    }


def detect_manager_index_collisions(db: Session) -> list[ManagerIndexCollisionReport]:
    """Report active duplicate manager indexes (employee + month + index)."""
    groups = _manager_collision_groups(db)
    if not groups:
        return []

    barber_ids = {g[0] for g in groups}
    fm_ids = {g[1] for g in groups}
    users = {
        row.id: row
        for row in db.query(User).filter(User.id.in_(barber_ids)).all()
    }
    financial_months = load_financial_months_map(db, fm_ids)

    reports: list[ManagerIndexCollisionReport] = []
    for barber_id, fm_id, index, rows in groups:
        fm = financial_months.get(fm_id)
        user = users.get(barber_id)
        employee_name = None
        if user and user.profile and user.profile.full_name:
            employee_name = user.profile.full_name
        elif user:
            employee_name = user.username
        reports.append(
            ManagerIndexCollisionReport(
                barber_user_id=barber_id,
                employee_name=employee_name,
                financial_month_id=fm_id,
                financial_year=fm.year if fm else None,
                financial_month=fm.month if fm else None,
                duplicate_index=index,
                index_label=(
                    format_ledger_index_label(
                        LedgerEntryType.SERVICE,
                        index,
                        year=fm.year,
                        month=fm.month,
                    )
                    if fm
                    else None
                ),
                affected_records=tuple(_collision_record_payload(r) for r in rows),
            )
        )
    reports.sort(
        key=lambda r: (
            r.employee_name or "",
            r.financial_year or 0,
            r.financial_month or 0,
            r.duplicate_index,
        )
    )
    return reports


def _choose_manager_collision_keeper(
    rows: list[LedgerEntry],
    *,
    employee: LedgerEntry | None,
) -> LedgerEntry:
    """Keep the row that best preserves existing reconciliation pairings."""
    if employee is not None:
        for row in rows:
            if (
                row.reconciliation_status == LedgerReconciliationStatus.APPROVED
                and row.amount == employee.amount
            ):
                return row
        for row in rows:
            if row.reconciliation_status == LedgerReconciliationStatus.APPROVED:
                return row
    return rows[0]


def _manager_indexes_in_use(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    financial_month_id: uuid.UUID,
) -> set[int]:
    rows = (
        _stream_filter(
            _service_base_filter(db, barber_user_id=barber_user_id),
            LedgerRecordStream.MANAGER,
        )
        .filter(LedgerEntry.financial_month_id == financial_month_id)
        .with_entities(LedgerEntry.barber_sequence_index)
        .all()
    )
    return {row[0] for row in rows if row[0] is not None}


def _next_repair_manager_index(occupied: set[int]) -> int:
    cursor = max(occupied) + 1 if occupied else 1
    while cursor in occupied:
        cursor += 1
    return cursor


def repair_manager_index_collisions(
    db: Session,
    *,
    dry_run: bool = False,
) -> tuple[list[ManagerIndexCollisionReport], list[dict[str, Any]]]:
    """
    Reassign duplicate active manager rows to fresh indexes and resync counters.

    Matched/approved pairings at the original index are preserved; later duplicates move.
    """
    before = detect_manager_index_collisions(db)
    actions: list[dict[str, Any]] = []
    if not before:
        return before, actions

    groups = _manager_collision_groups(db)
    by_scope: dict[tuple[uuid.UUID, uuid.UUID], list[tuple[int, list[LedgerEntry]]]] = {}
    for barber_id, fm_id, index, rows in groups:
        by_scope.setdefault((barber_id, fm_id), []).append((index, rows))

    for (barber_id, fm_id), scope_groups in by_scope.items():
        occupied = _manager_indexes_in_use(
            db,
            barber_user_id=barber_id,
            financial_month_id=fm_id,
        )
        for index, rows in scope_groups:
            employee = find_employee_row_at_index(
                db,
                barber_user_id=barber_id,
                financial_month_id=fm_id,
                index=index,
            )
            keeper = _choose_manager_collision_keeper(rows, employee=employee)
            for row in rows:
                if row.id == keeper.id:
                    continue
                new_index = _next_repair_manager_index(occupied)
                occupied.add(new_index)
                action = {
                    "entry_id": str(row.id),
                    "barber_user_id": str(barber_id),
                    "financial_month_id": str(fm_id),
                    "old_index": index,
                    "new_index": new_index,
                    "amount": str(row.amount),
                    "reconciliation_status": str(row.reconciliation_status)
                    if row.reconciliation_status
                    else None,
                }
                actions.append(action)
                if not dry_run:
                    row.barber_sequence_index = new_index
                    db.add(row)

        if not dry_run:
            sync_sequence_counter_from_ledger(
                db,
                barber_user_id=barber_id,
                financial_month_id=fm_id,
                stream=LedgerRecordStream.MANAGER,
            )

    if not dry_run:
        db.flush()

    return before, actions
