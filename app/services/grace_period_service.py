"""Grace period operational correction permissions and audit trail."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, ValidationAppError
from app.models.enums import FinancialMonthState, GracePeriodCorrectionAction, UserRole
from app.models.financial_month import FinancialMonth
from app.models.grace_period_correction import GracePeriodCorrection
from app.models.user import User
from app.services import audit_service


def grace_correction_allowed(fm: FinancialMonth, actor: User) -> bool:
    """True when admin/manager may perform operational corrections on this month."""
    return (
        fm.state == FinancialMonthState.GRACE_PERIOD
        and actor.role in {UserRole.MANAGER, UserRole.ADMIN}
    )


def month_history_read_only(
    fm: FinancialMonth | None,
    *,
    is_current_open: bool,
    actor: User,
) -> bool:
    """Whether indexed history / reconciliation UI should be read-only."""
    if fm is None:
        return True
    if fm.state == FinancialMonthState.LOCKED:
        return True
    if fm.state == FinancialMonthState.GRACE_PERIOD:
        return not grace_correction_allowed(fm, actor)
    return not is_current_open


def assert_grace_correction_month(
    db: Session,
    fm: FinancialMonth,
    actor: User,
) -> None:
    """Require the month to be in grace period with manager/admin actor."""
    if fm.state == FinancialMonthState.LOCKED:
        raise ValidationAppError(
            "This financial month is locked and cannot be modified.",
            code="FINANCIAL_MONTH_LOCKED",
        )
    if not grace_correction_allowed(fm, actor):
        raise ForbiddenError(
            "Operational corrections are only allowed during grace period by managers or admins.",
            code="GRACE_CORRECTION_NOT_ALLOWED",
        )


def record_grace_period_correction(
    db: Session,
    *,
    financial_month_id: uuid.UUID,
    action: GracePeriodCorrectionAction,
    entity_type: str,
    entity_id: str,
    reason: str,
    actor: User,
    previous_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    impersonator_id: uuid.UUID | None = None,
    ip_address: str | None = None,
) -> GracePeriodCorrection:
    trimmed = reason.strip()
    if not trimmed:
        raise ValidationAppError("Reason is required.", code="REASON_REQUIRED")

    row = GracePeriodCorrection(
        financial_month_id=financial_month_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        previous_value=previous_value,
        new_value=new_value,
        reason=trimmed,
        performed_by_user_id=actor.id,
    )
    db.add(row)
    db.flush()

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=impersonator_id,
        action=f"grace_period.{action.value}",
        entity_type=entity_type,
        entity_id=entity_id,
        message=f"Grace period correction ({action.value}): {trimmed}",
        payload={
            "correction_id": str(row.id),
            "financial_month_id": str(financial_month_id),
            "action": str(action),
            "previous_value": previous_value,
            "new_value": new_value,
            "reason": trimmed,
        },
        ip_address=ip_address,
    )
    return row


def serialize_correction(row: GracePeriodCorrection) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "financial_month_id": str(row.financial_month_id),
        "action": str(row.action),
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "previous_value": row.previous_value,
        "new_value": row.new_value,
        "reason": row.reason,
        "performed_by_user_id": str(row.performed_by_user_id),
        "created_at": row.created_at.isoformat(),
    }
