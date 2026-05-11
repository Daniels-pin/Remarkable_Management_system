"""Ledger orchestration: barber services, soft delete, audit hooks."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.models.barber_sequence_counter import BarberSequenceCounter
from app.models.enums import (
    LedgerEntryType,
    LedgerReconciliationStatus,
    RecordLifecycleState,
    UserRole,
)
from app.models.ledger import LedgerEntry
from app.models.user import User
from app.services import audit_service
from app.services.business_time import barber_may_edit_entry, business_date_for_instant
from app.services.financial_month_util import require_open_financial_month


def allocate_next_barber_index(db: Session, barber_user_id: uuid.UUID) -> int:
    counter = db.get(BarberSequenceCounter, barber_user_id)
    if counter is None:
        counter = BarberSequenceCounter(barber_user_id=barber_user_id, next_index=1)
        db.add(counter)
        db.flush()
    idx = counter.next_index
    counter.next_index = idx + 1
    db.add(counter)
    return idx


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
    """Manager-only official line when the barber did not submit (flagged on daily summary)."""
    if manager.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Managers or admins only.", code="FORBIDDEN")
    if amount <= 0:
        raise ValidationAppError("Amount must be positive.", code="INVALID_AMOUNT")

    business_date = business_date_for_instant(occurred_at)
    fm = require_open_financial_month(db, business_date)
    idx = allocate_next_barber_index(db, barber_user_id)

    row = LedgerEntry(
        financial_month_id=fm.id,
        entry_type=LedgerEntryType.SERVICE,
        occurred_at=occurred_at,
        business_date=business_date,
        service_type_id=service_type_id,
        employee_user_id=barber_user_id,
        amount=amount,
        original_barber_amount=None,
        manager_approved_amount=amount,
        barber_sequence_index=idx,
        reconciliation_status=LedgerReconciliationStatus.MISSING_BARBER_ENTRY,
        record_lifecycle=RecordLifecycleState.ACTIVE,
        payment_method=payment_method,
        note=note,
        created_by_user_id=manager.id,
        is_manager_created_without_barber=True,
    )
    db.add(row)
    db.flush()
    audit_service.write_audit_log(
        db,
        actor_user_id=manager.id,
        impersonator_user_id=impersonator_id,
        action="ledger.manager_official_line_create",
        entity_type="ledger_entry",
        entity_id=str(row.id),
        message=f"Manager official service #{idx:03d} for barber {barber_user_id}",
        payload={"barber_sequence_index": idx, "barber_user_id": str(barber_user_id)},
        ip_address=ip_address,
    )
    return row


def create_barber_service_entry(
    db: Session,
    *,
    actor: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    occurred_at: datetime,
    service_type_id: uuid.UUID,
    amount: Decimal,
    payment_method: Any,
    note: str | None,
) -> LedgerEntry:
    if actor.role != UserRole.BARBER:
        raise ForbiddenError("Only barbers can use this self-ledger endpoint.", code="NOT_BARBER")
    if amount <= 0:
        raise ValidationAppError("Amount must be positive.", code="INVALID_AMOUNT")

    business_date = business_date_for_instant(occurred_at)
    fm = require_open_financial_month(db, business_date)
    idx = allocate_next_barber_index(db, actor.id)

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
        reconciliation_status=LedgerReconciliationStatus.PENDING,
        record_lifecycle=RecordLifecycleState.ACTIVE,
        payment_method=payment_method,
        note=note,
        created_by_user_id=actor.id,
        is_manager_created_without_barber=False,
    )
    db.add(row)
    db.flush()

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=impersonator_id,
        action="ledger.barber_service_create",
        entity_type="ledger_entry",
        entity_id=str(row.id),
        message=f"Barber service #{idx:03d} recorded for ₦{amount}",
        payload={"barber_sequence_index": idx, "business_date": str(business_date)},
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
    payment_method: Any | None,
) -> LedgerEntry:
    if actor.role != UserRole.BARBER:
        raise ForbiddenError("Only barbers may edit their own ledger.", code="NOT_BARBER")
    row = db.get(LedgerEntry, entry_id)
    if row is None or row.record_lifecycle != RecordLifecycleState.ACTIVE:
        raise NotFoundError("Entry not found.", code="LEDGER_NOT_FOUND")
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
        if row.original_barber_amount is not None:
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
        row.service_type_id = service_type_id
    if note is not None:
        row.note = note
    if payment_method is not None:
        row.payment_method = payment_method

    db.add(row)
    db.flush()
    return row


def soft_delete_barber_entry(
    db: Session,
    *,
    actor: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    entry_id: uuid.UUID,
) -> None:
    row = db.get(LedgerEntry, entry_id)
    if row is None or row.record_lifecycle != RecordLifecycleState.ACTIVE:
        raise NotFoundError("Entry not found.", code="LEDGER_NOT_FOUND")
    if row.reconciliation_status in {
        LedgerReconciliationStatus.SETTLED,
        LedgerReconciliationStatus.LOCKED,
    }:
        raise ConflictError(
            "Cannot delete approved or settled records.", code="LEDGER_DELETE_FORBIDDEN"
        )
    if actor.role == UserRole.BARBER:
        if row.employee_user_id != actor.id:
            raise ForbiddenError(
                "Cannot delete another barber's records.", code="LEDGER_WRONG_BARBER"
            )
        bd = row.business_date
        if bd is None:
            raise ValidationAppError("Entry missing business_date.", code="LEDGER_DATA_ERROR")
        if not barber_may_edit_entry(business_date=bd, now=datetime.now(UTC)):
            raise ConflictError(
                "Deletes are locked after 21:00 on the business day.",
                code="BARBER_EDIT_CUTOFF",
            )
    elif actor.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Insufficient permissions.", code="FORBIDDEN")

    row.record_lifecycle = RecordLifecycleState.DELETED
    row.deleted_at = datetime.now(UTC)
    row.deleted_by_user_id = actor.id
    db.add(row)
    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=impersonator_id,
        action="ledger.entry_soft_delete",
        entity_type="ledger_entry",
        entity_id=str(row.id),
        message="Ledger entry soft-deleted",
        ip_address=ip_address,
    )


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


def list_barber_day_entries(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    business_day: date,
    page: int,
    page_size: int,
) -> tuple[list[LedgerEntry], int]:
    q = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.employee_user_id == barber_user_id,
            LedgerEntry.business_date == business_day,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
        )
        .order_by(
            LedgerEntry.barber_sequence_index.asc().nulls_last(), LedgerEntry.occurred_at.asc()
        )
    )
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    return rows, total


def barber_month_revenue_buckets(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    year: int,
    month: int,
) -> dict[str, Decimal]:
    """Split month revenue by reconciliation phase for the barber dashboard."""

    def _sum_for(
        statuses: set[LedgerReconciliationStatus] | None, use_manager_amount: bool
    ) -> Decimal:
        if use_manager_amount:
            col = func.coalesce(LedgerEntry.manager_approved_amount, LedgerEntry.amount)
        else:
            col = LedgerEntry.amount
        stmt = db.query(func.coalesce(func.sum(col), 0)).filter(
            LedgerEntry.employee_user_id == barber_user_id,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
            extract("year", LedgerEntry.business_date) == year,
            extract("month", LedgerEntry.business_date) == month,
        )
        if statuses is not None:
            stmt = stmt.filter(LedgerEntry.reconciliation_status.in_(statuses))
        val = stmt.scalar()
        return Decimal(val or 0)

    pending = _sum_for({LedgerReconciliationStatus.PENDING}, use_manager_amount=False)
    awaiting_review = _sum_for(
        {LedgerReconciliationStatus.AWAITING_BARBER_REVIEW}, use_manager_amount=True
    )
    adjusted = _sum_for(
        {LedgerReconciliationStatus.ADJUSTED, LedgerReconciliationStatus.APPROVED},
        use_manager_amount=True,
    )
    settled = _sum_for({LedgerReconciliationStatus.SETTLED}, use_manager_amount=True)
    disputed = _sum_for({LedgerReconciliationStatus.DISPUTED}, use_manager_amount=True)

    return {
        "pending_total": pending,
        "awaiting_review_total": awaiting_review,
        "adjusted_or_approved_total": adjusted,
        "settled_total": settled,
        "disputed_total": disputed,
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
            extract("year", LedgerEntry.business_date) == year,
            extract("month", LedgerEntry.business_date) == month,
        )
        .scalar()
    )
    return Decimal(val or 0)


def compute_index_reconciliation_issues(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    business_day: date,
) -> dict[str, Any]:
    """Detect duplicate indexes (integrity) and amount deltas barber vs manager draft."""
    rows = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.employee_user_id == barber_user_id,
            LedgerEntry.business_date == business_day,
            LedgerEntry.entry_type == LedgerEntryType.SERVICE,
            LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE,
        )
        .order_by(LedgerEntry.barber_sequence_index.asc())
        .all()
    )
    by_index: dict[int, list[LedgerEntry]] = {}
    for r in rows:
        if r.barber_sequence_index is None:
            continue
        by_index.setdefault(r.barber_sequence_index, []).append(r)

    duplicates = [idx for idx, lst in by_index.items() if len(lst) > 1]
    mismatches: list[dict[str, Any]] = []
    for r in rows:
        if r.barber_sequence_index is None:
            continue
        orig = r.original_barber_amount or r.amount
        mgr = r.manager_approved_amount
        if mgr is not None and orig != mgr:
            mismatches.append(
                {
                    "index": r.barber_sequence_index,
                    "entry_id": str(r.id),
                    "original_barber_amount": str(orig),
                    "manager_approved_amount": str(mgr),
                }
            )

    missing_entries: list[int] = []  # reserved for future manager-only index sets

    return {
        "duplicate_indexes": duplicates,
        "amount_mismatches": mismatches,
        "indexes_present": sorted(by_index.keys()),
        "missing_manager_indexes": missing_entries,
    }
