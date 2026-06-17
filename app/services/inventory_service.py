"""Barbershop retail inventory — stock, sales, profit snapshots, analytics."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.models.enums import (
    AppNotificationType,
    InventoryStockMovementType,
    LedgerEntryType,
    RecordLifecycleState,
    ServiceTypeStatus,
    UserRole,
)
from app.models.app_notification import AppNotification
from app.models.inventory import (
    InventoryCategory,
    InventoryProduct,
    InventoryProductSale,
    InventoryStockMovement,
)
from app.models.ledger import LedgerEntry
from app.models.user import User
from app.schemas.inventory import (
    InventoryCategoryCreate,
    InventoryCategoryUpdate,
    InventoryProductCreate,
    InventoryProductUpdate,
    ProductSaleCreate,
    StockAdjustBody,
    StockInBody,
)
from app.services import audit_service, notification_service
from app.services.business_time import business_date_for_instant
from app.services.financial_month_util import require_financial_month_for_new_entry
from app.services.ledger_service import allocate_shop_sequence_index

_ZERO = Decimal("0")


def _decimal(v) -> Decimal:
    if v is None:
        return _ZERO
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


def _category_dict(row: InventoryCategory) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "name": row.name,
        "status": row.status,
        "is_active": row.status == ServiceTypeStatus.ACTIVE,
        "sort_order": row.sort_order,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _product_base_dict(row: InventoryProduct, *, category_name: str | None = None) -> dict[str, Any]:
    cat_name = category_name or (row.category.name if row.category else None)
    cost = _decimal(row.cost_price)
    stock = int(row.stock_quantity)
    return {
        "id": str(row.id),
        "category_id": str(row.category_id),
        "category_name": cat_name,
        "name": row.name,
        "cost_price": str(cost),
        "default_selling_price": str(_decimal(row.default_selling_price)),
        "stock_quantity": stock,
        "low_stock_threshold": row.low_stock_threshold,
        "image_url": row.image_url,
        "status": row.status,
        "is_active": row.status == ServiceTypeStatus.ACTIVE,
        "is_low_stock": row.is_low_stock,
        "inventory_value": str(cost * stock),
        "sort_order": row.sort_order,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _movement_dict(row: InventoryStockMovement, *, product_name: str | None = None) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "product_id": str(row.product_id),
        "product_name": product_name,
        "movement_type": str(row.movement_type),
        "quantity_delta": row.quantity_delta,
        "quantity_before": row.quantity_before,
        "quantity_after": row.quantity_after,
        "unit_cost": str(row.unit_cost) if row.unit_cost is not None else None,
        "reference_type": row.reference_type,
        "reference_id": str(row.reference_id) if row.reference_id else None,
        "note": row.note,
        "created_by_user_id": str(row.created_by_user_id),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _user_label(db: Session, user_id: uuid.UUID | None) -> str | None:
    if not user_id:
        return None
    u = db.get(User, user_id)
    if u is None:
        return None
    if u.profile is not None and u.profile.full_name:
        return u.profile.full_name
    return f"@{u.username}"


def _recorder_label(db: Session, user_id: uuid.UUID | None) -> str | None:
    """Display label for who recorded a product sale (e.g. Admin Daniel, Manager Grace)."""
    if not user_id:
        return None
    u = db.get(User, user_id)
    if u is None:
        return None
    if u.profile is not None and u.profile.full_name:
        name = u.profile.full_name
    else:
        name = f"@{u.username}"
    role_prefix = {
        UserRole.ADMIN: "Admin",
        UserRole.MANAGER: "Manager",
    }.get(u.role)
    if role_prefix:
        return f"{role_prefix} {name}"
    return name


def _assert_inventory_access(user: User, *, admin_only: bool = False) -> None:
    if user.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Inventory access requires manager or admin.", code="FORBIDDEN")
    if admin_only and user.role != UserRole.ADMIN:
        raise ForbiddenError("Admin only.", code="ADMIN_ONLY")


def get_category(db: Session, category_id: uuid.UUID) -> InventoryCategory:
    row = db.get(InventoryCategory, category_id)
    if not row:
        raise NotFoundError("Category not found.", code="INVENTORY_CATEGORY_NOT_FOUND")
    return row


def assert_category_selectable(db: Session, category_id: uuid.UUID) -> InventoryCategory:
    row = get_category(db, category_id)
    if row.status != ServiceTypeStatus.ACTIVE:
        raise ValidationAppError(
            "This category is not available.", code="INVENTORY_CATEGORY_NOT_SELECTABLE"
        )
    return row


def list_categories(db: Session) -> list[InventoryCategory]:
    return (
        db.query(InventoryCategory)
        .order_by(InventoryCategory.sort_order, InventoryCategory.name)
        .all()
    )


def create_category(db: Session, body: InventoryCategoryCreate) -> InventoryCategory:
    name = body.name.strip()
    if not name:
        raise ValidationAppError("Category name is required.", code="BAD_NAME")
    existing = (
        db.query(InventoryCategory).filter(InventoryCategory.name.ilike(name)).first()
    )
    if existing:
        raise ConflictError("Category name already exists.", code="CATEGORY_NAME_TAKEN")
    max_sort = (
        db.query(InventoryCategory.sort_order)
        .order_by(InventoryCategory.sort_order.desc())
        .first()
    )
    row = InventoryCategory(
        name=name,
        status=str(body.status),
        sort_order=(max_sort[0] if max_sort else 0) + 1,
    )
    db.add(row)
    db.flush()
    return row


def update_category(
    db: Session, category_id: uuid.UUID, body: InventoryCategoryUpdate
) -> InventoryCategory:
    row = get_category(db, category_id)
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise ValidationAppError("Category name is required.", code="BAD_NAME")
        dup = (
            db.query(InventoryCategory)
            .filter(InventoryCategory.name.ilike(name), InventoryCategory.id != category_id)
            .first()
        )
        if dup:
            raise ConflictError("Category name already exists.", code="CATEGORY_NAME_TAKEN")
        row.name = name
    if body.status is not None:
        row.status = str(body.status)
    db.add(row)
    db.flush()
    return row


def get_product(db: Session, product_id: uuid.UUID) -> InventoryProduct:
    row = (
        db.query(InventoryProduct)
        .options(joinedload(InventoryProduct.category))
        .filter(InventoryProduct.id == product_id)
        .one_or_none()
    )
    if not row:
        raise NotFoundError("Product not found.", code="INVENTORY_PRODUCT_NOT_FOUND")
    return row


def assert_product_selectable(db: Session, product_id: uuid.UUID) -> InventoryProduct:
    row = get_product(db, product_id)
    if row.status != ServiceTypeStatus.ACTIVE:
        raise ValidationAppError(
            "This product is not available for sale.", code="INVENTORY_PRODUCT_NOT_SELECTABLE"
        )
    if row.category.status != ServiceTypeStatus.ACTIVE:
        raise ValidationAppError(
            "Product category is not active.", code="INVENTORY_CATEGORY_NOT_SELECTABLE"
        )
    return row


def list_products(
    db: Session,
    *,
    category_id: uuid.UUID | None = None,
    include_inactive: bool = False,
) -> list[InventoryProduct]:
    q = db.query(InventoryProduct).options(joinedload(InventoryProduct.category))
    if category_id:
        q = q.filter(InventoryProduct.category_id == category_id)
    if not include_inactive:
        q = q.filter(InventoryProduct.status == ServiceTypeStatus.ACTIVE)
    return q.order_by(InventoryProduct.sort_order, InventoryProduct.name).all()


_LOW_STOCK_ENTITY = "inventory_product"


def sync_low_stock_notifications(db: Session, *, product: InventoryProduct) -> None:
    """Create or clear low-stock notifications for managers and admins."""
    entity_id = str(product.id)
    if (
        product.status == ServiceTypeStatus.ACTIVE
        and product.is_low_stock
    ):
        existing = (
            db.query(AppNotification)
            .filter(
                AppNotification.entity_type == _LOW_STOCK_ENTITY,
                AppNotification.entity_id == entity_id,
                AppNotification.resolved_at.is_(None),
            )
            .first()
        )
        if existing is None:
            body = (
                f"{product.name}\n"
                f"Remaining: {product.stock_quantity}\n"
                f"Threshold: {product.low_stock_threshold}"
            )
            notification_service.notify_role_users(
                db,
                roles={UserRole.ADMIN, UserRole.MANAGER},
                notification_type=AppNotificationType.LOW_STOCK,
                title="Low Stock",
                body=body,
                entity_type=_LOW_STOCK_ENTITY,
                entity_id=entity_id,
            )
    else:
        notification_service.resolve_by_entity(
            db, entity_type=_LOW_STOCK_ENTITY, entity_id=entity_id
        )


def _apply_stock_change(
    db: Session,
    *,
    product: InventoryProduct,
    delta: int,
    movement_type: InventoryStockMovementType,
    actor_user_id: uuid.UUID,
    note: str | None = None,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> InventoryStockMovement:
    before = int(product.stock_quantity)
    after = before + delta
    if after < 0:
        raise ValidationAppError(
            "Insufficient stock for this operation.", code="INSUFFICIENT_STOCK"
        )
    product.stock_quantity = after
    db.add(product)
    movement = InventoryStockMovement(
        product_id=product.id,
        movement_type=movement_type,
        quantity_delta=delta,
        quantity_before=before,
        quantity_after=after,
        unit_cost=_decimal(product.cost_price),
        reference_type=reference_type,
        reference_id=reference_id,
        note=note,
        created_by_user_id=actor_user_id,
    )
    db.add(movement)
    db.flush()
    sync_low_stock_notifications(db, product=product)
    return movement


def create_product(db: Session, *, actor: User, body: InventoryProductCreate) -> InventoryProduct:
    _assert_inventory_access(actor)
    assert_category_selectable(db, body.category_id)
    name = body.name.strip()
    if not name:
        raise ValidationAppError("Product name is required.", code="BAD_NAME")

    max_sort = (
        db.query(InventoryProduct.sort_order)
        .filter(InventoryProduct.category_id == body.category_id)
        .order_by(InventoryProduct.sort_order.desc())
        .first()
    )
    row = InventoryProduct(
        category_id=body.category_id,
        name=name,
        cost_price=_decimal(body.cost_price),
        default_selling_price=_decimal(body.default_selling_price),
        stock_quantity=0,
        low_stock_threshold=body.low_stock_threshold,
        image_url=body.image_url.strip() if body.image_url else None,
        status=str(body.status),
        sort_order=(max_sort[0] if max_sort else 0) + 1,
    )
    db.add(row)
    db.flush()

    if body.opening_stock > 0:
        _apply_stock_change(
            db,
            product=row,
            delta=body.opening_stock,
            movement_type=InventoryStockMovementType.OPENING,
            actor_user_id=actor.id,
            note="Opening stock",
        )
    return row


def update_product(
    db: Session, *, actor: User, product_id: uuid.UUID, body: InventoryProductUpdate
) -> InventoryProduct:
    _assert_inventory_access(actor)
    row = get_product(db, product_id)
    if body.category_id is not None:
        assert_category_selectable(db, body.category_id)
        row.category_id = body.category_id
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise ValidationAppError("Product name is required.", code="BAD_NAME")
        row.name = name
    if body.cost_price is not None:
        row.cost_price = _decimal(body.cost_price)
    if body.default_selling_price is not None:
        row.default_selling_price = _decimal(body.default_selling_price)
    if body.low_stock_threshold is not None:
        row.low_stock_threshold = body.low_stock_threshold
    if body.image_url is not None:
        row.image_url = body.image_url.strip() if body.image_url else None
    if body.status is not None:
        row.status = str(body.status)
    db.add(row)
    db.flush()
    sync_low_stock_notifications(db, product=row)
    return row


def stock_in(
    db: Session, *, actor: User, product_id: uuid.UUID, body: StockInBody
) -> InventoryStockMovement:
    _assert_inventory_access(actor)
    product = get_product(db, product_id)
    return _apply_stock_change(
        db,
        product=product,
        delta=body.quantity,
        movement_type=InventoryStockMovementType.STOCK_IN,
        actor_user_id=actor.id,
        note=body.note,
    )


def adjust_stock(
    db: Session, *, actor: User, product_id: uuid.UUID, body: StockAdjustBody
) -> InventoryStockMovement:
    _assert_inventory_access(actor, admin_only=True)
    if body.quantity_delta == 0:
        raise ValidationAppError("Adjustment quantity cannot be zero.", code="INVALID_QUANTITY")
    product = get_product(db, product_id)
    return _apply_stock_change(
        db,
        product=product,
        delta=body.quantity_delta,
        movement_type=InventoryStockMovementType.ADJUSTMENT,
        actor_user_id=actor.id,
        note=body.note,
    )


def _active_sale_base(db: Session):
    return (
        db.query(InventoryProductSale)
        .join(LedgerEntry, InventoryProductSale.ledger_entry_id == LedgerEntry.id)
        .filter(LedgerEntry.record_lifecycle == RecordLifecycleState.ACTIVE)
    )


def product_lifetime_stats(db: Session, product_id: uuid.UUID) -> dict[str, str | int]:
    rows = _active_sale_base(db).filter(InventoryProductSale.product_id == product_id).all()
    revenue = sum((_decimal(r.revenue) for r in rows), _ZERO)
    cost = sum((_decimal(r.cost) for r in rows), _ZERO)
    profit = sum((_decimal(r.profit) for r in rows), _ZERO)
    units = sum(r.quantity for r in rows)
    return {
        "revenue_generated": str(revenue),
        "cost_generated": str(cost),
        "profit_generated": str(profit),
        "units_sold": units,
    }


def product_sales_history(
    db: Session,
    product_id: uuid.UUID,
    *,
    product_name: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    sales = (
        _active_sale_base(db)
        .options(joinedload(InventoryProductSale.ledger_entry))
        .filter(InventoryProductSale.product_id == product_id)
        .order_by(LedgerEntry.occurred_at.desc())
        .limit(limit)
        .all()
    )
    out: list[dict[str, Any]] = []
    for sale in sales:
        ledger = sale.ledger_entry
        recorder_id = ledger.created_by_user_id if ledger else None
        out.append(
            {
                "id": str(sale.id),
                "product_name": product_name,
                "quantity": sale.quantity,
                "revenue": str(sale.revenue),
                "profit": str(sale.profit),
                "recorded_by_user_id": str(recorder_id) if recorder_id else None,
                "recorded_by_label": _recorder_label(db, recorder_id),
                "occurred_at": ledger.occurred_at.isoformat() if ledger else None,
            }
        )
    return out


def product_detail(db: Session, product_id: uuid.UUID) -> dict[str, Any]:
    product = get_product(db, product_id)
    stats = product_lifetime_stats(db, product_id)
    movements = (
        db.query(InventoryStockMovement)
        .filter(InventoryStockMovement.product_id == product_id)
        .order_by(InventoryStockMovement.created_at.desc())
        .limit(100)
        .all()
    )
    payload = _product_base_dict(product, category_name=product.category.name)
    payload.update(stats)
    payload["stock_movements"] = [
        _movement_dict(m, product_name=product.name) for m in movements
    ]
    payload["sales_history"] = product_sales_history(db, product_id, product_name=product.name)
    return payload


def create_product_sale(
    db: Session,
    *,
    actor: User,
    body: ProductSaleCreate,
) -> tuple[LedgerEntry, InventoryProductSale]:
    _assert_inventory_access(actor)
    product = assert_product_selectable(db, body.product_id)

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

    revenue = unit_sell * qty
    cost = unit_cost * qty
    profit = revenue - cost

    business_date = business_date_for_instant(body.occurred_at)
    fm = require_financial_month_for_new_entry(db, business_date, actor)
    sale_idx = allocate_shop_sequence_index(
        db, financial_month_id=fm.id, entry_type=LedgerEntryType.SALE
    )

    note_parts = [f"{product.name} ×{qty}"]
    if body.note:
        note_parts.append(body.note.strip())
    ledger_note = " · ".join(note_parts)

    ledger_row = LedgerEntry(
        financial_month_id=fm.id,
        entry_type=LedgerEntryType.SALE,
        occurred_at=body.occurred_at,
        business_date=business_date,
        sale_category_id=None,
        employee_user_id=None,
        amount=revenue,
        barber_sequence_index=sale_idx,
        payment_method=body.payment_method,
        note=ledger_note,
        created_by_user_id=actor.id,
    )
    db.add(ledger_row)
    db.flush()

    _apply_stock_change(
        db,
        product=product,
        delta=-qty,
        movement_type=InventoryStockMovementType.SALE,
        actor_user_id=actor.id,
        note=ledger_note,
        reference_type="ledger_entry",
        reference_id=ledger_row.id,
    )

    sale_row = InventoryProductSale(
        ledger_entry_id=ledger_row.id,
        product_id=product.id,
        quantity=qty,
        unit_cost_price=unit_cost,
        unit_selling_price=unit_sell,
        revenue=revenue,
        cost=cost,
        profit=profit,
        sold_by_user_id=actor.id,
    )
    db.add(sale_row)
    db.flush()

    audit_service.write_audit_log(
        db,
        actor_user_id=actor.id,
        impersonator_user_id=None,
        action="inventory.product_sale",
        entity_type="ledger_entry",
        entity_id=str(ledger_row.id),
        message=f"Sold {qty}× {product.name} for ₦{revenue}",
        payload={
            "product_id": str(product.id),
            "quantity": qty,
            "revenue": str(revenue),
            "profit": str(profit),
        },
        ip_address=None,
    )
    return ledger_row, sale_row


def restore_stock_for_voided_sale(db: Session, *, ledger_entry: LedgerEntry, actor: User) -> None:
    """Restore inventory when a product sale ledger line is voided."""
    if ledger_entry.entry_type != LedgerEntryType.SALE:
        return
    sale = (
        db.query(InventoryProductSale)
        .filter(InventoryProductSale.ledger_entry_id == ledger_entry.id)
        .one_or_none()
    )
    if sale is None or sale.stock_restored:
        return

    product = get_product(db, sale.product_id)
    _apply_stock_change(
        db,
        product=product,
        delta=sale.quantity,
        movement_type=InventoryStockMovementType.VOID_RESTORE,
        actor_user_id=actor.id,
        note=f"Void restore · ledger {ledger_entry.id}",
        reference_type="ledger_entry",
        reference_id=ledger_entry.id,
    )
    sale.stock_restored = True
    db.add(sale)
    db.flush()


def reconcile_low_stock_notifications(db: Session) -> None:
    """Ensure notification state matches current stock levels."""
    for item in low_stock_products(db, limit=500):
        product = get_product(db, uuid.UUID(item["id"]))
        sync_low_stock_notifications(db, product=product)

    active_rows = (
        db.query(AppNotification)
        .filter(
            AppNotification.entity_type == _LOW_STOCK_ENTITY,
            AppNotification.resolved_at.is_(None),
        )
        .all()
    )
    for row in active_rows:
        try:
            product = get_product(db, uuid.UUID(row.entity_id))
        except NotFoundError:
            notification_service.resolve_by_entity(
                db, entity_type=_LOW_STOCK_ENTITY, entity_id=row.entity_id
            )
            continue
        if product.status != ServiceTypeStatus.ACTIVE or not product.is_low_stock:
            notification_service.resolve_by_entity(
                db, entity_type=_LOW_STOCK_ENTITY, entity_id=row.entity_id
            )


def low_stock_products(db: Session, *, limit: int = 50) -> list[dict[str, Any]]:
    rows = (
        db.query(InventoryProduct)
        .options(joinedload(InventoryProduct.category))
        .filter(
            InventoryProduct.status == ServiceTypeStatus.ACTIVE,
            InventoryProduct.low_stock_threshold > 0,
            InventoryProduct.stock_quantity <= InventoryProduct.low_stock_threshold,
        )
        .order_by(InventoryProduct.stock_quantity.asc())
        .limit(limit)
        .all()
    )
    return [_product_base_dict(r, category_name=r.category.name) for r in rows]


def inventory_value_total(db: Session) -> Decimal:
    rows = (
        db.query(InventoryProduct)
        .filter(InventoryProduct.status == ServiceTypeStatus.ACTIVE)
        .all()
    )
    return sum(_decimal(p.cost_price) * int(p.stock_quantity) for p in rows)


def product_sales_totals_in_range(
    db: Session, *, start: datetime, end: datetime
) -> dict[str, Decimal]:
    rows = (
        _active_sale_base(db)
        .filter(LedgerEntry.occurred_at >= start, LedgerEntry.occurred_at <= end)
        .all()
    )
    revenue = sum((_decimal(r.revenue) for r in rows), _ZERO)
    cost = sum((_decimal(r.cost) for r in rows), _ZERO)
    profit = sum((_decimal(r.profit) for r in rows), _ZERO)
    return {"revenue": revenue, "cost": cost, "profit": profit}


def product_analytics_for_product(
    db: Session,
    *,
    product_id: uuid.UUID,
    year: int | None = None,
    month: int | None = None,
) -> dict[str, Any]:
    product = get_product(db, product_id)
    q = _active_sale_base(db).filter(InventoryProductSale.product_id == product_id)
    if year is not None and month is not None:
        q = q.filter(
            extract("year", LedgerEntry.occurred_at) == year,
            extract("month", LedgerEntry.occurred_at) == month,
        )
    rows = q.all()
    revenue = sum((_decimal(r.revenue) for r in rows), _ZERO)
    cost = sum((_decimal(r.cost) for r in rows), _ZERO)
    profit = sum((_decimal(r.profit) for r in rows), _ZERO)
    units = sum(r.quantity for r in rows)
    return {
        "product_id": str(product_id),
        "product_name": product.name,
        "year": year,
        "month": month,
        "revenue": str(revenue),
        "cost": str(cost),
        "profit": str(profit),
        "units_sold": units,
    }


def sales_by_recorder_in_range(
    db: Session, *, start: datetime, end: datetime
) -> list[dict[str, Any]]:
    rows = (
        _active_sale_base(db)
        .options(joinedload(InventoryProductSale.ledger_entry))
        .filter(LedgerEntry.occurred_at >= start, LedgerEntry.occurred_at <= end)
        .all()
    )
    by_user: dict[uuid.UUID, dict[str, Any]] = {}
    for r in rows:
        uid = r.ledger_entry.created_by_user_id if r.ledger_entry else None
        if uid is None:
            continue
        bucket = by_user.setdefault(
            uid,
            {
                "recorded_by_user_id": str(uid),
                "recorded_by_label": _recorder_label(db, uid),
                "revenue": _ZERO,
                "cost": _ZERO,
                "profit": _ZERO,
                "units_sold": 0,
            },
        )
        bucket["revenue"] += _decimal(r.revenue)
        bucket["cost"] += _decimal(r.cost)
        bucket["profit"] += _decimal(r.profit)
        bucket["units_sold"] += r.quantity

    out = []
    for bucket in by_user.values():
        out.append(
            {
                **bucket,
                "revenue": str(bucket["revenue"]),
                "cost": str(bucket["cost"]),
                "profit": str(bucket["profit"]),
            }
        )
    out.sort(key=lambda x: Decimal(x["revenue"]), reverse=True)
    return out


def sales_by_employee_in_range(
    db: Session, *, start: datetime, end: datetime
) -> list[dict[str, Any]]:
    """Deprecated alias — product sales are attributed to the recorder, not team members."""
    return sales_by_recorder_in_range(db, start=start, end=end)


def enrich_ledger_with_product_sale(db: Session, ledger_row: LedgerEntry) -> dict[str, Any] | None:
    sale = (
        db.query(InventoryProductSale)
        .options(joinedload(InventoryProductSale.product).joinedload(InventoryProduct.category))
        .filter(InventoryProductSale.ledger_entry_id == ledger_row.id)
        .one_or_none()
    )
    if sale is None:
        return None
    product = sale.product
    recorder_id = ledger_row.created_by_user_id
    return {
        "id": str(sale.id),
        "product_id": str(sale.product_id),
        "product_name": product.name if product else None,
        "category_id": str(product.category_id) if product else None,
        "category_name": product.category.name if product and product.category else None,
        "quantity": sale.quantity,
        "unit_cost_price": str(sale.unit_cost_price),
        "unit_selling_price": str(sale.unit_selling_price),
        "revenue": str(sale.revenue),
        "cost": str(sale.cost),
        "profit": str(sale.profit),
        "recorded_by_user_id": str(recorder_id) if recorder_id else None,
        "recorded_by_label": _recorder_label(db, recorder_id),
        "stock_restored": sale.stock_restored,
    }
