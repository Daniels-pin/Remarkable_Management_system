"""Ledger orchestration: dual-stream indexed reconciliation."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import extract, func, or_
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.models.barber_sequence_counter import BarberSequenceCounter
from app.models.shop_ledger_sequence_counter import ShopLedgerSequenceCounter
from app.models.enums import (
    LedgerEntryType,
    LedgerReconciliationStatus,
    LedgerRecordStream,
    RecordLifecycleState,
    UserRole,
)
from app.models.catalog import ServiceType
from app.models.financial_month import FinancialMonth
from app.models.ledger import LedgerEntry
from app.models.user import User
from app.services import audit_service, catalog_service
from app.services.business_time import barber_may_edit_entry, business_date_for_instant, shop_tz
from app.services.financial_month_util import (
    require_financial_month_for_new_entry,
    require_writable_month_for_entry,
)


@dataclass(frozen=True)
class ReconciliationSlot:
    """Paired employee/manager records at the same index position."""

    index: int
    employee: LedgerEntry | None
    manager: LedgerEntry | None


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


def allocate_next_sequence_index(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    financial_month_id: uuid.UUID,
    stream: LedgerRecordStream,
) -> int:
    """Allocate the next index for an employee+month+stream (resets each month)."""
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
    idx = counter.next_index
    counter.next_index = idx + 1
    db.add(counter)
    return idx


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


def format_ledger_index_label(
    entry_type: LedgerEntryType,
    index: int | None,
) -> str | None:
    """Human index label: services #001, sales S-001, expenses E-001."""
    if index is None:
        return None
    if entry_type == LedgerEntryType.SALE:
        return f"S-{index:03d}"
    if entry_type == LedgerEntryType.EXPENSE:
        return f"E-{index:03d}"
    if entry_type == LedgerEntryType.SERVICE:
        return f"#{index:03d}"
    return str(index)


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


def _pair_reconciliation_status(
    employee: LedgerEntry | None,
    manager: LedgerEntry | None,
) -> str:
    """Compare employee vs manager streams by index (presence + amount only)."""
    if employee is None and manager is None:
        return "waiting_for_reconciliation"

    if _has_pending_void(employee):
        return "pending_delete_confirmation"

    if _is_voided(employee) and manager is not None and not _is_voided(manager):
        return "employee_record_voided"
    if _is_voided(manager) and employee is not None and not _is_voided(employee):
        return "manager_record_voided"
    if _is_voided(employee) and _is_voided(manager):
        return "employee_record_voided"

    if employee is None:
        if manager is not None and _is_voided(manager):
            return "manager_record_voided"
        return "missing_employee_entry"

    if manager is None:
        if _is_voided(employee):
            return "employee_record_voided"
        return "missing_manager_entry"

    emp_amt = _stream_amount(employee)
    mgr_amt = _stream_amount(manager)
    if emp_amt is not None and mgr_amt is not None and emp_amt != mgr_amt:
        return "mismatch"

    return "matched"


# Pair states excluded from shop-wide revenue, payroll inputs, and service counts.
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
        .one_or_none()
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
            employee_by_slot[(barber_id, fm_id, r.barber_sequence_index)] = r
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
            manager_by_slot[(barber_id, fm_id, r.barber_sequence_index)] = r

    out: dict[uuid.UUID, str] = {}
    for r in service_rows:
        slot_key = (r.employee_user_id, r.financial_month_id, r.barber_sequence_index)
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
    by_index: dict[int, ReconciliationSlot] = {}
    for r in employee_rows:
        if r.barber_sequence_index is None:
            continue
        idx = r.barber_sequence_index
        slot = by_index.get(idx)
        if slot is None:
            by_index[idx] = ReconciliationSlot(index=idx, employee=r, manager=None)
        else:
            by_index[idx] = ReconciliationSlot(index=idx, employee=r, manager=slot.manager)
    for r in manager_rows:
        if r.barber_sequence_index is None:
            continue
        idx = r.barber_sequence_index
        slot = by_index.get(idx)
        if slot is None:
            by_index[idx] = ReconciliationSlot(index=idx, employee=None, manager=r)
        else:
            by_index[idx] = ReconciliationSlot(index=idx, employee=slot.employee, manager=r)
    return sorted(by_index.values(), key=_slot_sort_key)


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
    """Day workspace: indexes where either stream has activity on this business day."""
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
    indexes = {
        r.barber_sequence_index
        for r in (*employee_day, *manager_day)
        if r.barber_sequence_index is not None
    }
    if not indexes:
        return []

    employee_rows = (
        _stream_filter(
            _service_base_filter(db, barber_user_id=barber_user_id, include_voided=True),
            LedgerRecordStream.EMPLOYEE,
        )
        .filter(LedgerEntry.barber_sequence_index.in_(indexes))
        .all()
    )
    manager_rows = (
        _stream_filter(
            _service_base_filter(db, barber_user_id=barber_user_id, include_voided=True),
            LedgerRecordStream.MANAGER,
        )
        .filter(LedgerEntry.barber_sequence_index.in_(indexes))
        .all()
    )
    slots = _build_slots_from_rows(employee_rows, manager_rows)
    return [s for s in slots if s.index in indexes]


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
        .one_or_none()
    )


def build_comparison_payload(
    slot: ReconciliationSlot,
    *,
    service_names: dict[uuid.UUID, str],
) -> dict[str, Any]:
    """Side-by-side reconciliation row for API responses."""
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
    row_id = f"{slot.index}:{employee.id if employee else ''}:{manager.id if manager else ''}"

    recon_status = None
    if employee and employee.reconciliation_status:
        recon_status = str(employee.reconciliation_status)
    elif manager and manager.reconciliation_status:
        recon_status = str(manager.reconciliation_status)

    return {
        "id": row_id,
        "employee_entry_id": str(employee.id) if employee else None,
        "manager_entry_id": str(manager.id) if manager else None,
        "index": slot.index,
        "barber_sequence_index": slot.index,
        "index_label": f"#{slot.index:03d}",
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
    items = [build_comparison_payload(s, service_names=names) for s in page_slots]
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
    items = [build_comparison_payload(s, service_names=names) for s in page_slots]
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
        message=f"Manager reconciliation #{idx:03d} for barber {barber_user_id}",
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

    row = LedgerEntry(
        financial_month_id=employee_row.financial_month_id,
        entry_type=LedgerEntryType.SERVICE,
        occurred_at=employee_row.occurred_at,
        business_date=employee_row.business_date,
        service_type_id=employee_row.service_type_id,
        employee_user_id=employee_row.employee_user_id,
        amount=amount,
        barber_sequence_index=employee_row.barber_sequence_index,
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
        message=f"Matched employee index #{employee_row.barber_sequence_index:03d}",
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
) -> list[dict[str, Any]]:
    """
    Shop-wide reconciliation inbox: one row per index slot.

    ``inbox_filter``: ``pending`` (one-sided) or ``mismatch`` (both sides, amounts differ).
    """
    if inbox_filter not in {"pending", "mismatch"}:
        raise ValidationAppError("Invalid inbox filter.", code="INVALID_FILTER")

    target_pending = {"missing_manager_entry", "missing_employee_entry"}
    target_mismatch = {"mismatch"}

    service_rows = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_stream.isnot(None),
            LedgerEntry.barber_sequence_index.isnot(None),
            LedgerEntry.employee_user_id.isnot(None),
        )
        .order_by(LedgerEntry.occurred_at.desc())
        .limit(1500)
        .all()
    )
    comparison = comparison_status_map_for_rows(db, service_rows)
    type_ids: set[uuid.UUID] = set()
    seen_slots: set[tuple[uuid.UUID, uuid.UUID, int]] = set()
    slots: list[ReconciliationSlot] = []

    for row in service_rows:
        if row.barber_sequence_index is None or row.employee_user_id is None:
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
                index=row.barber_sequence_index,
                employee=employee,
                manager=manager,
            )
        )
        for side in (employee, manager):
            if side and side.service_type_id:
                type_ids.add(side.service_type_id)
        if len(slots) >= limit:
            break

    from sqlalchemy.orm import joinedload

    from app.models.user import User as UserModel

    barber_ids = {
        (s.employee or s.manager).employee_user_id  # type: ignore[union-attr]
        for s in slots
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
    items: list[dict[str, Any]] = []
    for slot in slots:
        payload = build_comparison_payload(slot, service_names=names)
        primary = slot.employee or slot.manager
        barber_id = primary.employee_user_id if primary else None
        payload["employee_user_id"] = str(barber_id) if barber_id else None
        payload["employee_name"] = user_labels.get(barber_id) if barber_id else None
        payload["entry_type"] = "service"
        items.append(payload)
    return items


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
        message=f"Employee service #{idx:03d} recorded for ₦{amount}",
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
    items: list[dict[str, Any]] = []
    for row in rows:
        mgr = find_manager_row_at_index(
            db,
            barber_user_id=barber_user_id,
            financial_month_id=row.financial_month_id,
            index=row.barber_sequence_index,  # type: ignore[arg-type]
        )
        items.append(
            {
                "entry_id": str(row.id),
                "index": row.barber_sequence_index,
                "index_label": format_ledger_index_label(
                    LedgerEntryType.SERVICE, row.barber_sequence_index
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
) -> dict[str, Decimal | list[int]]:
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
        by_index: dict[int, int] = {}
        for r in rows:
            if r.barber_sequence_index is None:
                continue
            by_index[r.barber_sequence_index] = by_index.get(r.barber_sequence_index, 0) + 1
        return sorted(i for i, c in by_index.items() if c > 1)

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
