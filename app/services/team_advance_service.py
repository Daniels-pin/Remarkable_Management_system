"""Team advances — cash and product payroll deductions with inventory sync."""

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
    TeamAdvanceStatus,
    TeamAdvanceType,
    UserRole,
)
from app.models.inventory import InventoryProduct
from app.models.team_advance import TeamAdvance
from app.models.user import User
from app.schemas.team_advance import (
    TeamAdvanceCashCreate,
    TeamAdvanceProductCreate,
)
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
            "Team advances require manager or admin access.", code="FORBIDDEN"
        )


def _assert_team_member(db: Session, user_id: uuid.UUID) -> User:
    employee = db.get(User, user_id)
    if employee is None:
        raise NotFoundError("Employee not found.", code="EMPLOYEE_NOT_FOUND")
    if employee.role not in (UserRole.BARBER, UserRole.STAFF):
        raise ValidationAppError(
            "Team advances apply to barbers and staff only.",
            code="INVALID_EMPLOYEE_ROLE",
        )
    return employee


def _user_display(user: User | None) -> str | None:
    if user is None:
        return None
    if user.profile and user.profile.full_name:
        return user.profile.full_name
    return f"@{user.username}"


def _recorder_label(user: User | None) -> str | None:
    if user is None:
        return None
    name = _user_display(user)
    role_prefix = {UserRole.ADMIN: "Admin", UserRole.MANAGER: "Manager"}.get(user.role)
    if role_prefix and name:
        return f"{role_prefix} {name.replace('@', '')}"
    return name


def serialize_advance(row: TeamAdvance, *, db: Session | None = None) -> dict[str, Any]:
    product_name = row.product.name if row.product else None
    employee_name = _user_display(row.employee) if row.employee else None
    recorded_by_label = _recorder_label(row.recorded_by) if row.recorded_by else None
    voided_by_label = None
    if row.voided_by_user_id and db is not None:
        voided_by = db.get(User, row.voided_by_user_id)
        voided_by_label = _recorder_label(voided_by) or _user_display(voided_by)

    return {
        "id": str(row.id),
        "advance_type": str(row.advance_type),
        "status": str(row.status),
        "employee_user_id": str(row.employee_user_id),
        "employee_name": employee_name,
        "amount": str(row.amount),
        "reason": row.reason,
        "notes": row.notes,
        "business_date": row.business_date.isoformat(),
        "recorded_by_user_id": str(row.recorded_by_user_id),
        "recorded_by_label": recorded_by_label,
        "product_id": str(row.product_id) if row.product_id else None,
        "product_name": product_name,
        "quantity": row.quantity,
        "unit_cost_price": str(row.unit_cost_price) if row.unit_cost_price is not None else None,
        "unit_selling_price": (
            str(row.unit_selling_price) if row.unit_selling_price is not None else None
        ),
        "settlement_year": row.settlement_year,
        "settlement_month": row.settlement_month,
        "settlement_financial_month_id": (
            str(row.settlement_financial_month_id) if row.settlement_financial_month_id else None
        ),
        "voided_by_user_id": str(row.voided_by_user_id) if row.voided_by_user_id else None,
        "voided_by_label": voided_by_label,
        "void_reason": row.void_reason,
        "voided_at": row.voided_at.isoformat() if row.voided_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def get_advance(db: Session, advance_id: uuid.UUID) -> TeamAdvance:
    row = (
        db.query(TeamAdvance)
        .options(
            joinedload(TeamAdvance.employee).joinedload(User.profile),
            joinedload(TeamAdvance.product),
            joinedload(TeamAdvance.recorded_by).joinedload(User.profile),
        )
        .filter(TeamAdvance.id == advance_id)
        .one_or_none()
    )
    if row is None:
        raise NotFoundError("Team advance not found.", code="TEAM_ADVANCE_NOT_FOUND")
    return row


def create_cash_advance(
    db: Session,
    *,
    actor: User,
    body: TeamAdvanceCashCreate,
) -> TeamAdvance:
    _assert_manager_or_admin(actor)
    employee = _assert_team_member(db, body.employee_user_id)
    reason = body.reason.strip()
    if not reason:
        raise ValidationAppError("Reason is required.", code="REASON_REQUIRED")

    fm = require_financial_month_for_new_entry(db, body.business_date, actor)
    row = TeamAdvance(
        advance_type=TeamAdvanceType.CASH,
        status=TeamAdvanceStatus.OUTSTANDING,
        employee_user_id=employee.id,
        financial_month_id=fm.id,
        amount=_decimal(body.amount),
        reason=reason,
        notes=body.notes.strip() if body.notes else None,
        business_date=body.business_date,
        recorded_by_user_id=actor.id,
    )
    db.add(row)
    db.flush()

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=None,
        action="team_advance.cash_created",
        entity_type="team_advance",
        entity_id=str(row.id),
        message=f"Cash advance ₦{row.amount} for {_user_display(employee)}",
        payload={
            "employee_user_id": str(employee.id),
            "amount": str(row.amount),
            "reason": reason,
        },
        ip_address=None,
    )
    return row


def create_product_advance(
    db: Session,
    *,
    actor: User,
    body: TeamAdvanceProductCreate,
) -> TeamAdvance:
    _assert_manager_or_admin(actor)
    employee = _assert_team_member(db, body.employee_user_id)
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
    unit_sell = (
        _decimal(body.unit_selling_price)
        if body.unit_selling_price is not None
        else _decimal(product.default_selling_price)
    )
    if unit_sell < 0:
        raise ValidationAppError("Selling price must be non-negative.", code="INVALID_PRICE")

    amount = unit_sell * qty
    fm = require_financial_month_for_new_entry(db, body.business_date, actor)
    note = f"Team advance · {product.name} ×{qty}"

    row = TeamAdvance(
        advance_type=TeamAdvanceType.PRODUCT,
        status=TeamAdvanceStatus.OUTSTANDING,
        employee_user_id=employee.id,
        financial_month_id=fm.id,
        amount=amount,
        reason=reason,
        notes=body.notes.strip() if body.notes else None,
        business_date=body.business_date,
        recorded_by_user_id=actor.id,
        product_id=product.id,
        quantity=qty,
        unit_cost_price=unit_cost,
        unit_selling_price=unit_sell,
    )
    db.add(row)
    db.flush()

    inventory_service._apply_stock_change(
        db,
        product=product,
        delta=-qty,
        movement_type=InventoryStockMovementType.TEAM_ADVANCE,
        actor_user_id=actor.id,
        note=note,
        reference_type="team_advance",
        reference_id=row.id,
    )

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=None,
        action="team_advance.product_created",
        entity_type="team_advance",
        entity_id=str(row.id),
        message=f"Product advance {qty}× {product.name} for {_user_display(employee)}",
        payload={
            "employee_user_id": str(employee.id),
            "product_id": str(product.id),
            "quantity": qty,
            "amount": str(amount),
        },
        ip_address=None,
    )
    return row


def void_advance(
    db: Session,
    *,
    actor: User,
    advance_id: uuid.UUID,
    void_reason: str,
) -> TeamAdvance:
    _assert_manager_or_admin(actor)
    row = get_advance(db, advance_id)
    if row.status == TeamAdvanceStatus.VOIDED:
        raise ValidationAppError("Advance is already voided.", code="ALREADY_VOIDED")
    if row.status == TeamAdvanceStatus.DEDUCTED:
        raise ValidationAppError(
            "Cannot void an advance already deducted from payroll.",
            code="ADVANCE_ALREADY_DEDUCTED",
        )

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
        "amount": str(row.amount),
        "advance_type": str(row.advance_type),
    }

    if (
        row.advance_type == TeamAdvanceType.PRODUCT
        and row.product_id
        and row.quantity
        and not row.inventory_restored
    ):
        product = inventory_service.get_product(db, row.product_id)
        inventory_service._apply_stock_change(
            db,
            product=product,
            delta=row.quantity,
            movement_type=InventoryStockMovementType.VOID_RESTORE,
            actor_user_id=actor.id,
            note=f"Void restore · team advance {row.id}",
            reference_type="team_advance",
            reference_id=row.id,
        )
        row.inventory_restored = True

    row.status = TeamAdvanceStatus.VOIDED
    row.voided_by_user_id = actor.id
    row.void_reason = reason
    row.voided_at = datetime.now(UTC)
    db.add(row)

    if fm is not None and grace_period_service.grace_correction_allowed(fm, actor):
        grace_period_service.record_grace_period_correction(
            db,
            financial_month_id=fm.id,
            action=GracePeriodCorrectionAction.TEAM_ADVANCE_VOID,
            entity_type="team_advance",
            entity_id=str(row.id),
            reason=reason,
            actor=actor,
            previous_value=previous,
            new_value={"status": str(TeamAdvanceStatus.VOIDED), "voided": True},
        )

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=None,
        action="team_advance.voided",
        entity_type="team_advance",
        entity_id=str(row.id),
        message=f"Voided team advance: {reason}",
        payload={"void_reason": reason},
        ip_address=None,
    )
    return row


def _active_advances_query(db: Session, *, user_id: uuid.UUID, year: int, month: int):
    return (
        db.query(TeamAdvance)
        .options(
            joinedload(TeamAdvance.product),
            joinedload(TeamAdvance.employee).joinedload(User.profile),
            joinedload(TeamAdvance.recorded_by).joinedload(User.profile),
        )
        .filter(
            TeamAdvance.employee_user_id == user_id,
            TeamAdvance.status.in_(
                (TeamAdvanceStatus.OUTSTANDING, TeamAdvanceStatus.DEDUCTED)
            ),
            extract("year", TeamAdvance.business_date) == year,
            extract("month", TeamAdvance.business_date) == month,
        )
        .order_by(TeamAdvance.business_date.asc(), TeamAdvance.created_at.asc())
    )


def month_team_advances_summary(
    db: Session, *, user_id: uuid.UUID, year: int, month: int
) -> dict[str, Any]:
    rows = _active_advances_query(db, user_id=user_id, year=year, month=month).all()
    total = sum((_decimal(r.amount) for r in rows), _ZERO)
    items = [serialize_advance(r, db=db) for r in rows]
    return {
        "total": str(total),
        "items": items,
    }


def month_team_advances_total(
    db: Session, *, user_id: uuid.UUID, year: int, month: int
) -> Decimal:
    return _decimal(month_team_advances_summary(db, user_id=user_id, year=year, month=month)["total"])


def list_advances(
    db: Session,
    *,
    actor: User,
    business_date: date | None = None,
    year: int | None = None,
    month: int | None = None,
    employee_user_id: uuid.UUID | None = None,
    status: TeamAdvanceStatus | None = None,
    advance_type: TeamAdvanceType | None = None,
) -> list[TeamAdvance]:
    q = db.query(TeamAdvance).options(
        joinedload(TeamAdvance.product),
        joinedload(TeamAdvance.employee).joinedload(User.profile),
        joinedload(TeamAdvance.recorded_by).joinedload(User.profile),
    )

    if actor.role in (UserRole.BARBER, UserRole.STAFF):
        q = q.filter(TeamAdvance.employee_user_id == actor.id)
    elif employee_user_id is not None:
        q = q.filter(TeamAdvance.employee_user_id == employee_user_id)

    if business_date is not None:
        q = q.filter(TeamAdvance.business_date == business_date)
    if year is not None:
        q = q.filter(extract("year", TeamAdvance.business_date) == year)
    if month is not None:
        q = q.filter(extract("month", TeamAdvance.business_date) == month)
    if status is not None:
        q = q.filter(TeamAdvance.status == status)
    if advance_type is not None:
        q = q.filter(TeamAdvance.advance_type == advance_type)

    return q.order_by(TeamAdvance.business_date.desc(), TeamAdvance.created_at.desc()).all()


def month_report(
    db: Session,
    *,
    year: int,
    month: int,
) -> dict[str, Any]:
    base = db.query(TeamAdvance).filter(
        extract("year", TeamAdvance.business_date) == year,
        extract("month", TeamAdvance.business_date) == month,
    )
    outstanding = (
        base.filter(TeamAdvance.status == TeamAdvanceStatus.OUTSTANDING)
        .with_entities(func.coalesce(func.sum(TeamAdvance.amount), 0))
        .scalar()
    )
    deducted = (
        base.filter(TeamAdvance.status == TeamAdvanceStatus.DEDUCTED)
        .with_entities(func.coalesce(func.sum(TeamAdvance.amount), 0))
        .scalar()
    )
    cash_total = (
        base.filter(
            TeamAdvance.advance_type == TeamAdvanceType.CASH,
            TeamAdvance.status.in_(
                (TeamAdvanceStatus.OUTSTANDING, TeamAdvanceStatus.DEDUCTED)
            ),
        )
        .with_entities(func.coalesce(func.sum(TeamAdvance.amount), 0))
        .scalar()
    )
    product_total = (
        base.filter(
            TeamAdvance.advance_type == TeamAdvanceType.PRODUCT,
            TeamAdvance.status.in_(
                (TeamAdvanceStatus.OUTSTANDING, TeamAdvanceStatus.DEDUCTED)
            ),
        )
        .with_entities(func.coalesce(func.sum(TeamAdvance.amount), 0))
        .scalar()
    )
    return {
        "year": year,
        "month": month,
        "total_outstanding": str(_decimal(outstanding)),
        "total_deducted": str(_decimal(deducted)),
        "total_cash_advances": str(_decimal(cash_total)),
        "total_product_advances": str(_decimal(product_total)),
        "total_team_advances": str(_decimal(_decimal(cash_total) + _decimal(product_total))),
    }


def settle_advances_for_user_month(
    db: Session,
    *,
    user_id: uuid.UUID,
    year: int,
    month: int,
    financial_month_id: uuid.UUID | None = None,
) -> int:
    """Mark outstanding advances as deducted when payroll for the month is finalized."""
    rows = (
        db.query(TeamAdvance)
        .filter(
            TeamAdvance.employee_user_id == user_id,
            TeamAdvance.status == TeamAdvanceStatus.OUTSTANDING,
            extract("year", TeamAdvance.business_date) == year,
            extract("month", TeamAdvance.business_date) == month,
        )
        .all()
    )
    for row in rows:
        row.status = TeamAdvanceStatus.DEDUCTED
        row.settlement_year = year
        row.settlement_month = month
        if financial_month_id is not None:
            row.settlement_financial_month_id = financial_month_id
        db.add(row)
    return len(rows)


def settle_advances_for_month(
    db: Session,
    *,
    year: int,
    month: int,
    financial_month_id: uuid.UUID | None = None,
) -> int:
    """Mark all outstanding advances in a calendar month as deducted."""
    rows = (
        db.query(TeamAdvance)
        .filter(
            TeamAdvance.status == TeamAdvanceStatus.OUTSTANDING,
            extract("year", TeamAdvance.business_date) == year,
            extract("month", TeamAdvance.business_date) == month,
        )
        .all()
    )
    for row in rows:
        row.status = TeamAdvanceStatus.DEDUCTED
        row.settlement_year = year
        row.settlement_month = month
        if financial_month_id is not None:
            row.settlement_financial_month_id = financial_month_id
        db.add(row)
    return len(rows)
