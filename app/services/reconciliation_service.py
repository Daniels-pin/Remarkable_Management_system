"""Daily summary reconciliation: manager propose → barber review → dispute → admin."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.models.barber_daily_summary import BarberDailySummary
from app.models.enums import (
    AppNotificationType,
    BarberDailySummaryStatus,
    LedgerReconciliationStatus,
    ReconciliationTimelineEventType,
    RecordLifecycleState,
    UserRole,
)
from app.models.ledger import LedgerEntry
from app.models.reconciliation_timeline import ReconciliationTimelineEvent
from app.models.user import User
from app.services import audit_service, ledger_service, notification_service
from app.services.financial_month_util import require_grace_or_open_month_for_reconciliation


def _timeline(
    db: Session,
    summary: BarberDailySummary,
    event_type: ReconciliationTimelineEventType,
    actor_id: uuid.UUID | None,
    message: str | None,
    payload: dict[str, Any] | None,
) -> None:
    db.add(
        ReconciliationTimelineEvent(
            summary_id=summary.id,
            event_type=event_type,
            actor_user_id=actor_id,
            message=message,
            payload=payload,
        )
    )


def _day_employee_entries(
    db: Session, barber_user_id: uuid.UUID, business_day: date
) -> list[LedgerEntry]:
    return ledger_service.day_employee_stream_entries(db, barber_user_id, business_day)


def _day_manager_entries(
    db: Session, barber_user_id: uuid.UUID, business_day: date
) -> list[LedgerEntry]:
    return ledger_service.day_manager_stream_entries(db, barber_user_id, business_day)


def refresh_daily_summary_totals_from_ledger(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    business_day: date,
) -> BarberDailySummary | None:
    """Recompute cached day totals from active (non-voided) stream entries."""
    summary = (
        db.query(BarberDailySummary)
        .filter(
            BarberDailySummary.barber_user_id == barber_user_id,
            BarberDailySummary.business_date == business_day,
        )
        .one_or_none()
    )
    if summary is None:
        return None

    employee_entries = _day_employee_entries(db, barber_user_id, business_day)
    manager_entries = _day_manager_entries(db, barber_user_id, business_day)
    summary.total_original_barber = sum((e.amount for e in employee_entries), Decimal("0"))
    summary.total_manager_approved = sum((m.amount for m in manager_entries), Decimal("0"))
    db.add(summary)
    db.flush()
    return summary


def _apply_status_to_day_streams(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    business_day: date,
    status: LedgerReconciliationStatus,
) -> None:
    for row in (
        *_day_employee_entries(db, barber_user_id, business_day),
        *_day_manager_entries(db, barber_user_id, business_day),
    ):
        row.reconciliation_status = status
        db.add(row)


def get_or_create_daily_summary(
    db: Session,
    *,
    barber_user_id: uuid.UUID,
    business_day: date,
    actor: User | None = None,
) -> BarberDailySummary:
    row = (
        db.query(BarberDailySummary)
        .filter(
            BarberDailySummary.barber_user_id == barber_user_id,
            BarberDailySummary.business_date == business_day,
        )
        .one_or_none()
    )
    if row:
        return row

    if actor is not None:
        fm = require_grace_or_open_month_for_reconciliation(db, business_day, actor)
    else:
        from app.services.financial_month_util import get_financial_month_for_calendar_date

        fm = get_financial_month_for_calendar_date(db, business_day)
        if fm is None:
            raise ValidationAppError(
                "No financial month exists for this calendar month.",
                code="FINANCIAL_MONTH_MISSING",
            )

    row = BarberDailySummary(
        barber_user_id=barber_user_id,
        financial_month_id=fm.id,
        business_date=business_day,
        status=BarberDailySummaryStatus.OPEN,
        manager_proposal_version=0,
        total_original_barber=Decimal("0"),
        total_manager_approved=Decimal("0"),
        used_manager_entries_due_to_missing_barber=False,
    )
    db.add(row)
    db.flush()
    return row


def manager_propose_daily_summary(
    db: Session,
    *,
    manager: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    barber_user_id: uuid.UUID,
    business_day: date,
    entry_amounts: dict[uuid.UUID, Decimal] | None,
    mark_missing_barber_submission: bool,
) -> BarberDailySummary:
    if manager.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Managers or admins only.", code="FORBIDDEN")

    require_grace_or_open_month_for_reconciliation(db, business_day, manager)
    summary = get_or_create_daily_summary(
        db, barber_user_id=barber_user_id, business_day=business_day, actor=manager
    )
    employee_entries = _day_employee_entries(db, barber_user_id, business_day)
    manager_entries = _day_manager_entries(db, barber_user_id, business_day)

    if summary.status == BarberDailySummaryStatus.AWAITING_BARBER_REVIEW:
        raise ConflictError(
            "Already awaiting barber review. Wait for accept/reject first.",
            code="SUMMARY_AWAITING_REVIEW",
        )
    if summary.status == BarberDailySummaryStatus.SETTLED:
        raise ConflictError("Day already settled.", code="SUMMARY_ALREADY_SETTLED")
    if summary.status == BarberDailySummaryStatus.ADMIN_PENDING:
        raise ConflictError("Awaiting admin resolution.", code="SUMMARY_ADMIN_PENDING")
    if summary.status == BarberDailySummaryStatus.SETTLED_BY_ADMIN:
        raise ConflictError("Day closed by admin.", code="SUMMARY_CLOSED_ADMIN")
    if summary.status == BarberDailySummaryStatus.DISPUTED:
        raise ConflictError(
            "Summary is disputed; use the manager revision endpoint.",
            code="SUMMARY_USE_REVISION",
        )

    if not employee_entries and not manager_entries and not mark_missing_barber_submission:
        raise ValidationAppError(
            "No entries for this day. Confirm missing barber submission to record officially.",
            code="SUMMARY_EMPTY",
        )

    amounts_map = entry_amounts or {}
    total_orig = Decimal("0")
    total_mgr = Decimal("0")

    for e in employee_entries:
        orig = e.amount
        total_orig += orig
        mgr = amounts_map.get(e.id, orig)
        if mgr < 0:
            raise ValidationAppError("Manager amounts cannot be negative.", code="INVALID_AMOUNT")
        ledger_service.upsert_manager_row_for_employee_index(
            db,
            manager=manager,
            employee_row=e,
            amount=mgr,
            summary_id=summary.id,
        )
        e.reconciliation_status = LedgerReconciliationStatus.AWAITING_BARBER_REVIEW
        e.barber_daily_summary_id = summary.id
        total_mgr += mgr
        db.add(e)

    for m in manager_entries:
        if m.id not in amounts_map:
            total_mgr += m.amount
            m.reconciliation_status = LedgerReconciliationStatus.AWAITING_BARBER_REVIEW
            m.barber_daily_summary_id = summary.id
            db.add(m)
            continue
        mgr = amounts_map[m.id]
        if mgr < 0:
            raise ValidationAppError("Manager amounts cannot be negative.", code="INVALID_AMOUNT")
        m.amount = mgr
        m.reconciliation_status = LedgerReconciliationStatus.AWAITING_BARBER_REVIEW
        m.barber_daily_summary_id = summary.id
        total_mgr += mgr
        db.add(m)

    barber_submitted_any = len(employee_entries) > 0
    summary.used_manager_entries_due_to_missing_barber = bool(
        mark_missing_barber_submission and not barber_submitted_any
    )
    summary.total_original_barber = total_orig
    summary.total_manager_approved = total_mgr
    summary.manager_proposal_version += 1
    summary.status = BarberDailySummaryStatus.AWAITING_BARBER_REVIEW
    summary.last_manager_action_at = datetime.now(UTC)
    summary.last_manager_action_by_id = manager.id
    db.add(summary)

    _timeline(
        db,
        summary,
        ReconciliationTimelineEventType.MANAGER_APPROVED_SUMMARY,
        manager.id,
        "Manager proposed official totals for the day.",
        {"version": summary.manager_proposal_version, "totals": str(total_mgr)},
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=manager.id,
        impersonator_user_id=impersonator_id,
        action="reconciliation.manager_propose",
        entity_type="barber_daily_summary",
        entity_id=str(summary.id),
        message="Manager approved daily summary",
        ip_address=ip_address,
    )
    notification_service.resolve_by_entity(
        db, entity_type="barber_daily_summary", entity_id=str(summary.id)
    )
    notification_service.notify_user(
        db,
        user_id=barber_user_id,
        notification_type=AppNotificationType.RECONCILIATION_REVIEW_REQUEST,
        title="Reconciliation review",
        body="Your manager posted reconciled totals for you to review.",
        entity_type="barber_daily_summary",
        entity_id=str(summary.id),
    )
    return summary


def manager_revise_after_dispute(
    db: Session,
    *,
    manager: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    barber_user_id: uuid.UUID,
    business_day: date,
    entry_amounts: dict[uuid.UUID, Decimal] | None,
) -> BarberDailySummary:
    if manager.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Managers or admins only.", code="FORBIDDEN")
    require_grace_or_open_month_for_reconciliation(db, business_day, manager)
    summary = get_or_create_daily_summary(
        db, barber_user_id=barber_user_id, business_day=business_day, actor=manager
    )
    if summary.status != BarberDailySummaryStatus.DISPUTED:
        raise ConflictError(
            "Nothing to revise unless the summary is disputed.", code="SUMMARY_NOT_DISPUTED"
        )
    if summary.manager_proposal_version >= 2:
        raise ConflictError(
            "Manager revision limit reached; escalate to admin.",
            code="MANAGER_REVISION_EXHAUSTED",
        )

    amounts_map = entry_amounts or {}
    total_orig = Decimal("0")
    total_mgr = Decimal("0")

    for e in _day_employee_entries(db, barber_user_id, business_day):
        orig = e.amount
        total_orig += orig
        mgr = amounts_map.get(e.id, e.amount)
        ledger_service.upsert_manager_row_for_employee_index(
            db,
            manager=manager,
            employee_row=e,
            amount=mgr,
            summary_id=summary.id,
        )
        e.reconciliation_status = LedgerReconciliationStatus.AWAITING_BARBER_REVIEW
        db.add(e)
        total_mgr += mgr

    for m in _day_manager_entries(db, barber_user_id, business_day):
        mgr = amounts_map.get(m.id, m.amount)
        m.amount = mgr
        m.reconciliation_status = LedgerReconciliationStatus.AWAITING_BARBER_REVIEW
        m.barber_daily_summary_id = summary.id
        total_mgr += mgr
        db.add(m)

    summary.total_original_barber = total_orig
    summary.total_manager_approved = total_mgr
    summary.manager_proposal_version += 1
    summary.status = BarberDailySummaryStatus.AWAITING_BARBER_REVIEW
    summary.barber_rejection_reason = None
    summary.last_manager_action_at = datetime.now(UTC)
    summary.last_manager_action_by_id = manager.id
    db.add(summary)

    _timeline(
        db,
        summary,
        ReconciliationTimelineEventType.MANAGER_REVISED,
        manager.id,
        "Manager revised totals after barber dispute.",
        {"version": summary.manager_proposal_version},
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=manager.id,
        impersonator_user_id=impersonator_id,
        action="reconciliation.manager_revise",
        entity_type="barber_daily_summary",
        entity_id=str(summary.id),
        message="Manager revised reconciliation",
        ip_address=ip_address,
    )
    notification_service.resolve_by_entity(
        db, entity_type="barber_daily_summary", entity_id=str(summary.id)
    )
    notification_service.notify_user(
        db,
        user_id=barber_user_id,
        notification_type=AppNotificationType.RECONCILIATION_REVIEW_REQUEST,
        title="Updated reconciliation",
        body="Please review the revised daily totals from your manager.",
        entity_type="barber_daily_summary",
        entity_id=str(summary.id),
    )
    return summary


def barber_accept_summary(
    db: Session,
    *,
    barber: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    business_day: date,
) -> BarberDailySummary:
    if barber.role not in (UserRole.BARBER, UserRole.STAFF):
        raise ForbiddenError("Service providers only.", code="NOT_SERVICE_PROVIDER")
    require_grace_or_open_month_for_reconciliation(db, business_day, barber)
    summary = get_or_create_daily_summary(
        db, barber_user_id=barber.id, business_day=business_day, actor=barber
    )
    if summary.status != BarberDailySummaryStatus.AWAITING_BARBER_REVIEW:
        raise ConflictError(
            "No reconciliation is awaiting your review.", code="SUMMARY_WRONG_STATE"
        )
    _apply_status_to_day_streams(
        db,
        barber_user_id=barber.id,
        business_day=business_day,
        status=LedgerReconciliationStatus.SETTLED,
    )
    summary.status = BarberDailySummaryStatus.SETTLED
    summary.settled_at = datetime.now(UTC)
    summary.settled_by_user_id = barber.id
    db.add(summary)
    _timeline(
        db,
        summary,
        ReconciliationTimelineEventType.BARBER_ACCEPTED,
        barber.id,
        "Barber accepted reconciliation.",
        None,
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=barber.id,
        impersonator_user_id=impersonator_id,
        action="reconciliation.barber_accept",
        entity_type="barber_daily_summary",
        entity_id=str(summary.id),
        message="Barber accepted reconciliation",
        ip_address=ip_address,
    )
    notification_service.resolve_by_entity(
        db, entity_type="barber_daily_summary", entity_id=str(summary.id)
    )
    return summary


def barber_reject_summary(
    db: Session,
    *,
    barber: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    business_day: date,
    reason: str,
) -> BarberDailySummary:
    if barber.role not in (UserRole.BARBER, UserRole.STAFF):
        raise ForbiddenError("Service providers only.", code="NOT_SERVICE_PROVIDER")
    if not reason.strip():
        raise ValidationAppError(
            "A rejection reason is required.", code="REJECTION_REASON_REQUIRED"
        )
    require_grace_or_open_month_for_reconciliation(db, business_day, barber)
    summary = get_or_create_daily_summary(
        db, barber_user_id=barber.id, business_day=business_day, actor=barber
    )
    if summary.status != BarberDailySummaryStatus.AWAITING_BARBER_REVIEW:
        raise ConflictError(
            "No reconciliation is awaiting your review.", code="SUMMARY_WRONG_STATE"
        )

    if summary.manager_proposal_version >= 2:
        summary.status = BarberDailySummaryStatus.ADMIN_PENDING
        summary.barber_rejection_reason = reason.strip()
        _apply_status_to_day_streams(
            db,
            barber_user_id=barber.id,
            business_day=business_day,
            status=LedgerReconciliationStatus.DISPUTED,
        )
        db.add(summary)
        _timeline(
            db,
            summary,
            ReconciliationTimelineEventType.BARBER_REJECTED,
            barber.id,
            "Barber rejected after manager final pass — admin required.",
            {"reason": reason.strip()},
        )
        notification_service.resolve_by_entity(
            db, entity_type="barber_daily_summary", entity_id=str(summary.id)
        )
        notification_service.notify_role_users(
            db,
            roles={UserRole.ADMIN},
            notification_type=AppNotificationType.DISPUTE_REQUIRES_ADMIN,
            title="Dispute requires admin",
            body=f"Barber {barber.username} escalated a daily reconciliation.",
            entity_type="barber_daily_summary",
            entity_id=str(summary.id),
        )
    else:
        summary.status = BarberDailySummaryStatus.DISPUTED
        summary.barber_rejection_reason = reason.strip()
        _apply_status_to_day_streams(
            db,
            barber_user_id=barber.id,
            business_day=business_day,
            status=LedgerReconciliationStatus.DISPUTED,
        )
        db.add(summary)
        _timeline(
            db,
            summary,
            ReconciliationTimelineEventType.BARBER_REJECTED,
            barber.id,
            "Barber rejected reconciliation.",
            {"reason": reason.strip()},
        )
        notification_service.notify_role_users(
            db,
            roles={UserRole.MANAGER, UserRole.ADMIN},
            notification_type=AppNotificationType.DISPUTE_REQUIRES_MANAGER,
            title="Disputed daily summary",
            body=f"Barber {barber.username} rejected reconciliation for {business_day}.",
            entity_type="barber_daily_summary",
            entity_id=str(summary.id),
        )

    audit_service.write_audit_log(
        db,
        actor_user_id=barber.id,
        impersonator_user_id=impersonator_id,
        action="reconciliation.barber_reject",
        entity_type="barber_daily_summary",
        entity_id=str(summary.id),
        message="Barber rejected reconciliation",
        payload={"reason": reason.strip(), "version": summary.manager_proposal_version},
        ip_address=ip_address,
    )
    return summary


def admin_resolve_daily_dispute(
    db: Session,
    *,
    admin: User,
    impersonator_id: uuid.UUID | None,
    ip_address: str | None,
    summary_id: uuid.UUID,
    final_day_total: Decimal,
    note: str,
) -> BarberDailySummary:
    if admin.role != UserRole.ADMIN:
        raise ForbiddenError("Admins only.", code="ADMIN_ONLY")
    summary = db.get(BarberDailySummary, summary_id)
    if summary is None:
        raise NotFoundError("Summary not found.", code="SUMMARY_NOT_FOUND")
    if summary.status != BarberDailySummaryStatus.ADMIN_PENDING:
        raise ConflictError(
            "Summary is not awaiting admin intervention.", code="SUMMARY_WRONG_STATE"
        )
    if final_day_total < 0:
        raise ValidationAppError("Final amount cannot be negative.", code="INVALID_AMOUNT")

    manager_entries = _day_manager_entries(
        db, summary.barber_user_id, summary.business_date
    )
    current = sum(e.amount for e in manager_entries) or Decimal("0")

    if manager_entries and current == 0:
        share = (final_day_total / Decimal(len(manager_entries))).quantize(Decimal("0.01"))
        for e in manager_entries:
            e.amount = share
            e.reconciliation_status = LedgerReconciliationStatus.SETTLED
            db.add(e)
    elif manager_entries:
        for e in manager_entries:
            weight = e.amount / current
            e.amount = (final_day_total * weight).quantize(Decimal("0.01"))
            e.reconciliation_status = LedgerReconciliationStatus.SETTLED
            db.add(e)

    _apply_status_to_day_streams(
        db,
        barber_user_id=summary.barber_user_id,
        business_day=summary.business_date,
        status=LedgerReconciliationStatus.SETTLED,
    )

    summary.admin_final_day_total = final_day_total
    summary.admin_resolution_note = note.strip()
    summary.admin_resolved_at = datetime.now(UTC)
    summary.admin_resolved_by_user_id = admin.id
    summary.status = BarberDailySummaryStatus.SETTLED_BY_ADMIN
    summary.settled_at = datetime.now(UTC)
    summary.settled_by_user_id = admin.id
    db.add(summary)

    _timeline(
        db,
        summary,
        ReconciliationTimelineEventType.ADMIN_RESOLVED,
        admin.id,
        "Admin resolved dispute with final totals.",
        {"final_day_total": str(final_day_total), "note": note.strip()},
    )
    audit_service.write_audit_log(
        db,
        actor_user_id=admin.id,
        impersonator_user_id=impersonator_id,
        action="reconciliation.admin_resolve",
        entity_type="barber_daily_summary",
        entity_id=str(summary.id),
        message=f"Admin resolved dispute at ₦{final_day_total}",
        ip_address=ip_address,
    )
    notification_service.resolve_by_entity(
        db, entity_type="barber_daily_summary", entity_id=str(summary.id)
    )
    return summary
