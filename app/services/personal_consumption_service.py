"""Personal consumption — inventory withdrawals for admin/manager personal use."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationAppError
from app.models.enums import (
    GracePeriodCorrectionAction,
    InventoryStockMovementType,
    PersonalConsumptionStatus,
    UserRole,
)
from app.models.personal_consumption import PersonalConsumption
from app.models.user import User
from app.schemas.personal_consumption import PersonalConsumptionCreate
from app.services import audit_service, grace_period_service, inventory_service
from app.services.financial_month_util import (
    get_financial_month_by_id,
    require_financial_month_for_new_entry,
    require_writable_month_for_entry,
)

_ZERO = Decimal("0")


def _decimal(v) -> Decimal:
    if v is None:
        return _ZERO
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


def _assert_manager_or_admin(user: User) -> None:
    if user.role not in (UserRole.MANAGER, UserRole.ADMIN):
        raise ForbiddenError(
            "Personal consumption requires manager or admin access.", code="FORBIDDEN"
        )


def _user_display(user: User | None) -> str | None:
    if user is None:
        return None
    if user.profile and user.profile.full_name:
        return user.profile.full_name
    return f"@{user.username}"


def _role_label(user: User | None) -> str | None:
    if user is None:
        return None
    name = _user_display(user)
    role_prefix = {UserRole.ADMIN: "Admin", UserRole.MANAGER: "Manager"}.get(user.role)
    if role_prefix and name:
        return f"{role_prefix} {name.replace('@', '')}"
    return name


def _assert_consumed_by_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.", code="USER_NOT_FOUND")
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise ValidationAppError(
            "Personal consumption applies to admin or manager only.",
            code="INVALID_CONSUMED_BY_ROLE",
        )
    return user


def serialize_consumption(
    row: PersonalConsumption, *, db: Session | None = None
) -> dict[str, Any]:
    product_name = row.product.name if row.product else None
    consumed_by_label = _role_label(row.consumed_by) if row.consumed_by else None
    recorded_by_label = _role_label(row.recorded_by) if row.recorded_by else None
    voided_by_label = None
    if row.voided_by_user_id and db is not None:
        voided_by = db.get(User, row.voided_by_user_id)
        voided_by_label = _role_label(voided_by) or _user_display(voided_by)

    return {
        "id": str(row.id),
        "status": str(row.status),
        "product_id": str(row.product_id),
        "product_name": product_name,
        "quantity": row.quantity,
        "unit_cost_price": str(row.unit_cost_price),
        "unit_selling_price": str(row.unit_selling_price),
        "total_cost_value": str(row.total_cost_value),
        "total_selling_value": str(row.total_selling_value),
        "consumed_by_user_id": str(row.consumed_by_user_id),
        "consumed_by_label": consumed_by_label,
        "recorded_by_user_id": str(row.recorded_by_user_id),
        "recorded_by_label": recorded_by_label,
        "reason": row.reason,
        "notes": row.notes,
        "business_date": row.business_date.isoformat(),
        "voided_by_user_id": str(row.voided_by_user_id) if row.voided_by_user_id else None,
        "voided_by_label": voided_by_label,
        "void_reason": row.void_reason,
        "voided_at": row.voided_at.isoformat() if row.voided_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def get_consumption(db: Session, consumption_id: uuid.UUID) -> PersonalConsumption:
    row = (
        db.query(PersonalConsumption)
        .options(
            joinedload(PersonalConsumption.product),
            joinedload(PersonalConsumption.consumed_by).joinedload(User.profile),
            joinedload(PersonalConsumption.recorded_by).joinedload(User.profile),
        )
        .filter(PersonalConsumption.id == consumption_id)
        .one_or_none()
    )
    if row is None:
        raise NotFoundError(
            "Personal consumption not found.", code="PERSONAL_CONSUMPTION_NOT_FOUND"
        )
    return row


def create_consumption(
    db: Session,
    *,
    actor: User,
    body: PersonalConsumptionCreate,
) -> PersonalConsumption:
    _assert_manager_or_admin(actor)
    consumed_by = _assert_consumed_by_user(db, body.consumed_by_user_id)
    reason = body.reason.strip()
    if not reason:
        raise ValidationAppError("Reason is required.", code="REASON_REQUIRED")

    product = inventory_service.assert_product_selectable(db, body.product_id)
    qty = body.quantity
    if product.stock_quantity < qty:
        raise ValidationAppError(
            f"Only {product.stock_quantity} unit(s) in stock.",
            code="INSUFFICIENT_STOCK",
        )

    unit_cost = _decimal(product.cost_price)
    unit_sell = _decimal(product.default_selling_price)
    total_cost = unit_cost * qty
    total_sell = unit_sell * qty
    fm = require_financial_month_for_new_entry(db, body.business_date, actor)
    note = f"Personal consumption · {product.name} ×{qty}"

    row = PersonalConsumption(
        status=PersonalConsumptionStatus.ACTIVE,
        product_id=product.id,
        quantity=qty,
        unit_cost_price=unit_cost,
        unit_selling_price=unit_sell,
        total_cost_value=total_cost,
        total_selling_value=total_sell,
        consumed_by_user_id=consumed_by.id,
        recorded_by_user_id=actor.id,
        financial_month_id=fm.id,
        reason=reason,
        notes=body.notes.strip() if body.notes else None,
        business_date=body.business_date,
    )
    db.add(row)
    db.flush()

    inventory_service._apply_stock_change(
        db,
        product=product,
        delta=-qty,
        movement_type=InventoryStockMovementType.PERSONAL_CONSUMPTION,
        actor_user_id=actor.id,
        note=note,
        reference_type="personal_consumption",
        reference_id=row.id,
    )

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=None,
        action="personal_consumption.created",
        entity_type="personal_consumption",
        entity_id=str(row.id),
        message=f"Personal consumption {qty}× {product.name} by {_role_label(consumed_by)}",
        payload={
            "product_id": str(product.id),
            "quantity": qty,
            "consumed_by_user_id": str(consumed_by.id),
            "total_cost_value": str(total_cost),
        },
        ip_address=None,
    )
    return row


def void_consumption(
    db: Session,
    *,
    actor: User,
    consumption_id: uuid.UUID,
    void_reason: str,
) -> PersonalConsumption:
    _assert_manager_or_admin(actor)
    row = get_consumption(db, consumption_id)
    if row.status == PersonalConsumptionStatus.VOIDED:
        raise ValidationAppError("Record is already voided.", code="ALREADY_VOIDED")

    reason = void_reason.strip()
    if not reason:
        raise ValidationAppError("Void reason is required.", code="VOID_REASON_REQUIRED")

    fm = get_financial_month_by_id(db, row.financial_month_id)
    if fm is not None:
        require_writable_month_for_entry(
            db,
            financial_month_id=fm.id,
            actor=actor,
            grace_operational=True,
        )

    previous = {
        "status": str(row.status),
        "quantity": row.quantity,
        "total_cost_value": str(row.total_cost_value),
    }

    if not row.inventory_restored:
        product = inventory_service.get_product(db, row.product_id)
        inventory_service._apply_stock_change(
            db,
            product=product,
            delta=row.quantity,
            movement_type=InventoryStockMovementType.VOID_RESTORE,
            actor_user_id=actor.id,
            note=f"Void restore · personal consumption {row.id}",
            reference_type="personal_consumption",
            reference_id=row.id,
        )
        row.inventory_restored = True

    row.status = PersonalConsumptionStatus.VOIDED
    row.voided_by_user_id = actor.id
    row.void_reason = reason
    row.voided_at = datetime.now(UTC)
    db.add(row)

    if fm is not None and grace_period_service.grace_correction_allowed(fm, actor):
        grace_period_service.record_grace_period_correction(
            db,
            financial_month_id=fm.id,
            action=GracePeriodCorrectionAction.PERSONAL_CONSUMPTION_VOID,
            entity_type="personal_consumption",
            entity_id=str(row.id),
            reason=reason,
            actor=actor,
            previous_value=previous,
            new_value={"status": str(PersonalConsumptionStatus.VOIDED), "voided": True},
        )

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=None,
        action="personal_consumption.voided",
        entity_type="personal_consumption",
        entity_id=str(row.id),
        message=f"Voided personal consumption: {reason}",
        payload={"void_reason": reason},
        ip_address=None,
    )
    return row


def list_consumptions(
    db: Session,
    *,
    actor: User,
    business_date: date | None = None,
    year: int | None = None,
    month: int | None = None,
    status: PersonalConsumptionStatus | None = None,
) -> list[PersonalConsumption]:
    _assert_manager_or_admin(actor)
    q = db.query(PersonalConsumption).options(
        joinedload(PersonalConsumption.product),
        joinedload(PersonalConsumption.consumed_by).joinedload(User.profile),
        joinedload(PersonalConsumption.recorded_by).joinedload(User.profile),
    )

    if business_date is not None:
        q = q.filter(PersonalConsumption.business_date == business_date)
    if year is not None:
        q = q.filter(extract("year", PersonalConsumption.business_date) == year)
    if month is not None:
        q = q.filter(extract("month", PersonalConsumption.business_date) == month)
    if status is not None:
        q = q.filter(PersonalConsumption.status == status)

    return q.order_by(
        PersonalConsumption.business_date.desc(), PersonalConsumption.created_at.desc()
    ).all()


def list_consumers(db: Session) -> list[dict[str, Any]]:
    rows = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(User.role.in_((UserRole.ADMIN, UserRole.MANAGER)))
        .order_by(User.role.asc(), User.username.asc())
        .all()
    )
    return [
        {
            "id": str(u.id),
            "role": str(u.role),
            "label": _role_label(u) or _user_display(u) or str(u.id),
        }
        for u in rows
    ]


def consumption_totals_in_range(
    db: Session, *, start: date, end: date
) -> dict[str, Decimal]:
    """Sum active personal consumption by business_date (inventory value at cost)."""
    result = (
        db.query(
            func.coalesce(func.sum(PersonalConsumption.total_cost_value), 0),
            func.coalesce(func.sum(PersonalConsumption.total_selling_value), 0),
            func.count(PersonalConsumption.id),
        )
        .filter(
            PersonalConsumption.status == PersonalConsumptionStatus.ACTIVE,
            PersonalConsumption.business_date >= start,
            PersonalConsumption.business_date <= end,
        )
        .one()
    )
    return {
        "total_cost_value": _decimal(result[0]),
        "total_selling_value": _decimal(result[1]),
        "count": int(result[2] or 0),
    }


def consumption_totals_for_datetime_range(
    db: Session, *, start: datetime, end: datetime
) -> dict[str, Any]:
    tz_start = start.date() if isinstance(start, datetime) else start
    tz_end = end.date() if isinstance(end, datetime) else end
    totals = consumption_totals_in_range(db, start=tz_start, end=tz_end)
    return {
        "personal_consumption_cost": str(totals["total_cost_value"]),
        "personal_consumption_selling": str(totals["total_selling_value"]),
        "personal_consumption_count": totals["count"],
    }


def month_report(
    db: Session,
    *,
    year: int,
    month: int,
) -> dict[str, Any]:
    totals = (
        db.query(
            func.coalesce(func.sum(PersonalConsumption.total_cost_value), 0),
            func.coalesce(func.sum(PersonalConsumption.total_selling_value), 0),
            func.count(PersonalConsumption.id),
        )
        .filter(
            PersonalConsumption.status == PersonalConsumptionStatus.ACTIVE,
            extract("year", PersonalConsumption.business_date) == year,
            extract("month", PersonalConsumption.business_date) == month,
        )
        .one()
    )
    return {
        "year": year,
        "month": month,
        "total_cost_value": str(_decimal(totals[0])),
        "total_selling_value": str(_decimal(totals[1])),
        "total_personal_consumption": str(_decimal(totals[0])),
        "record_count": int(totals[2] or 0),
    }

