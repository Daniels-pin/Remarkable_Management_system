from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.furniture.models.enums import FurnitureOrderStatus
from app.furniture.models.invoice import FurnitureInvoice
from app.furniture.models.order import (
    FurnitureOrder,
    FurnitureOrderItem,
    FurnitureOrderPayment,
    FurnitureOrderSequenceCounter,
)
from app.furniture.schemas.orders import (
    FurnitureOrderCreate,
    FurnitureOrderDepositCreate,
    FurnitureOrderStatusUpdate,
)

ORDER_NUMBER_PREFIX = "FUR"


def _money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _format_order_number(year: int, index: int) -> str:
    return f"{ORDER_NUMBER_PREFIX}-{year}-{index:03d}"


def allocate_order_sequence(db: Session, *, year: int | None = None) -> tuple[int, int]:
    """Return (year, index) for a new order. Counter never decrements."""
    calendar_year = year if year is not None else datetime.now(UTC).year
    counter = db.get(FurnitureOrderSequenceCounter, calendar_year)
    if counter is None:
        counter = FurnitureOrderSequenceCounter(calendar_year=calendar_year, next_index=1)
        db.add(counter)
        db.flush()
    index = counter.next_index
    counter.next_index = index + 1
    db.add(counter)
    return calendar_year, index


def _deposit_total(order: FurnitureOrder) -> Decimal:
    return _money(sum((p.amount for p in order.payments), Decimal("0")))


def order_item_to_dict(row: FurnitureOrderItem) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "description": row.description,
        "quantity": row.quantity,
        "unit_price": float(row.unit_price),
        "line_total": float(row.line_total),
        "sort_order": row.sort_order,
    }


def order_to_dict(db: Session, order: FurnitureOrder) -> dict:
    deposit_paid = _deposit_total(order)
    grand_total = _money(order.grand_total)
    outstanding = _money(grand_total - deposit_paid)
    converted_invoice_number = None
    if order.converted_invoice_id:
        invoice = db.get(FurnitureInvoice, order.converted_invoice_id)
        if invoice:
            converted_invoice_number = invoice.invoice_number

    return {
        "id": str(order.id),
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "customer_address": order.customer_address,
        "customer_phone": order.customer_phone,
        "due_date": order.due_date.isoformat(),
        "status": order.status.value,
        "subtotal": float(order.subtotal),
        "grand_total": float(grand_total),
        "deposit_paid": float(deposit_paid),
        "outstanding_balance": float(outstanding),
        "items": [order_item_to_dict(i) for i in order.items],
        "source_quotation_id": str(order.source_quotation_id) if order.source_quotation_id else None,
        "source_quotation_number": order.source_quotation_number,
        "converted_invoice_id": str(order.converted_invoice_id)
        if order.converted_invoice_id
        else None,
        "converted_invoice_number": converted_invoice_number,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat(),
    }


def _load_order(db: Session, order_id: uuid.UUID) -> FurnitureOrder:
    order = (
        db.query(FurnitureOrder)
        .options(joinedload(FurnitureOrder.items), joinedload(FurnitureOrder.payments))
        .filter(FurnitureOrder.id == order_id)
        .one_or_none()
    )
    if order is None:
        raise NotFoundError("Order not found.", code="FURNITURE_ORDER_NOT_FOUND")
    return order


def create_order(db: Session, body: FurnitureOrderCreate) -> FurnitureOrder:
    if body.due_date is None:
        raise ValidationAppError("Due date is required.", code="DUE_DATE_REQUIRED")

    subtotal = Decimal("0")
    item_rows: list[FurnitureOrderItem] = []
    for idx, item in enumerate(body.items):
        if not item.name.strip():
            raise ValidationAppError("Each order item must have a name.", code="ITEM_NAME_REQUIRED")
        if item.quantity <= 0:
            raise ValidationAppError("Quantity must be greater than zero.", code="INVALID_QUANTITY")
        if item.unit_price < 0:
            raise ValidationAppError("Unit price cannot be negative.", code="INVALID_UNIT_PRICE")
        line_total = _money(item.quantity * item.unit_price)
        subtotal += line_total
        item_rows.append(
            FurnitureOrderItem(
                sort_order=idx,
                name=item.name.strip(),
                description=item.description.strip() if item.description else None,
                quantity=item.quantity,
                unit_price=_money(item.unit_price),
                line_total=line_total,
            )
        )

    subtotal = _money(subtotal)
    grand_total = subtotal  # MVP: no tax/discount

    year, index = allocate_order_sequence(db)
    order_number = _format_order_number(year, index)

    order = FurnitureOrder(
        order_number=order_number,
        sequence_year=year,
        sequence_index=index,
        customer_name=body.customer_name.strip(),
        customer_address=body.customer_address.strip() if body.customer_address else None,
        customer_phone=body.customer_phone.strip(),
        due_date=body.due_date,
        status=FurnitureOrderStatus.PENDING,
        subtotal=subtotal,
        grand_total=grand_total,
        items=item_rows,
    )
    db.add(order)
    db.flush()

    if body.initial_deposit > 0:
        db.add(
            FurnitureOrderPayment(
                order_id=order.id,
                amount=_money(body.initial_deposit),
                note="Initial deposit",
            )
        )

    db.flush()
    return _load_order(db, order.id)


def list_orders(db: Session, *, search: str | None = None) -> list[FurnitureOrder]:
    q = (
        db.query(FurnitureOrder)
        .options(joinedload(FurnitureOrder.items), joinedload(FurnitureOrder.payments))
        .order_by(FurnitureOrder.created_at.desc())
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                FurnitureOrder.order_number.ilike(term),
                FurnitureOrder.customer_name.ilike(term),
                FurnitureOrder.customer_phone.ilike(term),
            )
        )
    return list(q.all())


def get_order(db: Session, order_id: uuid.UUID) -> FurnitureOrder:
    return _load_order(db, order_id)


def update_order_status(
    db: Session, order_id: uuid.UUID, body: FurnitureOrderStatusUpdate
) -> FurnitureOrder:
    order = _load_order(db, order_id)
    order.status = body.status
    db.add(order)
    db.flush()
    return _load_order(db, order.id)


def record_deposit(
    db: Session, order_id: uuid.UUID, body: FurnitureOrderDepositCreate
) -> FurnitureOrder:
    if body.amount <= 0:
        raise ValidationAppError("Deposit amount must be greater than zero.", code="INVALID_DEPOSIT")
    order = _load_order(db, order_id)
    db.add(
        FurnitureOrderPayment(
            order_id=order.id,
            amount=_money(body.amount),
            note=body.note.strip() if body.note else None,
        )
    )
    db.flush()
    return _load_order(db, order.id)


def get_dashboard_summary(db: Session) -> dict:
    status_counts = {
        FurnitureOrderStatus.PENDING.value: 0,
        FurnitureOrderStatus.IN_PROGRESS.value: 0,
        FurnitureOrderStatus.COMPLETED.value: 0,
    }
    rows = db.query(FurnitureOrder.status, func.count(FurnitureOrder.id)).group_by(
        FurnitureOrder.status
    )
    for status, count in rows:
        status_counts[status.value] = int(count)

    total_orders = sum(status_counts.values())

    total_revenue = _money(
        db.query(func.coalesce(func.sum(FurnitureOrder.grand_total), 0)).scalar() or Decimal("0")
    )
    deposits_made = _money(
        db.query(func.coalesce(func.sum(FurnitureOrderPayment.amount), 0)).scalar() or Decimal("0")
    )
    outstanding = _money(total_revenue - deposits_made)

    return {
        "orders": {
            "total": total_orders,
            "pending": status_counts[FurnitureOrderStatus.PENDING.value],
            "in_progress": status_counts[FurnitureOrderStatus.IN_PROGRESS.value],
            "completed": status_counts[FurnitureOrderStatus.COMPLETED.value],
        },
        "financial": {
            "total_revenue": float(total_revenue),
            "deposits_made": float(deposits_made),
            "outstanding_balance": float(outstanding),
        },
    }
