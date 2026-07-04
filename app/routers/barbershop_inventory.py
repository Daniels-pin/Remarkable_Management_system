from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_actor_context, get_db, get_manager_or_admin_actor
from app.core.exceptions import ForbiddenError
from app.models.enums import UserRole
from app.schemas.inventory import (
    InventoryCategoryCreate,
    InventoryCategoryUpdate,
    InventoryProductCreate,
    InventoryProductUpdate,
    ProductSaleCreate,
    StockAdjustBody,
    StockInBody,
)
from app.services import inventory_service, ledger_service
from app.services.business_time import shop_tz
from app.services.operations_analytics_service import snapshot_time_bounds

router = APIRouter(prefix="/barbershop/inventory", tags=["barbershop-inventory"])


def _require_inventory_view(actor: ActorContext) -> None:
    if actor.user.role not in (UserRole.MANAGER, UserRole.ADMIN):
        raise ForbiddenError("Inventory access requires manager or admin.", code="FORBIDDEN")


@router.get("/categories")
def list_categories(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_inventory_view(actor)
    rows = inventory_service.list_categories(db)
    items = [inventory_service._category_dict(r) for r in rows]
    if not include_inactive:
        items = [i for i in items if i["status"] == "active"]
    return {"items": items}


@router.post("/categories")
def create_category(
    body: InventoryCategoryCreate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = inventory_service.create_category(db, body)
    db.commit()
    db.refresh(row)
    return inventory_service._category_dict(row)


@router.patch("/categories/{category_id}")
def update_category(
    category_id: uuid.UUID,
    body: InventoryCategoryUpdate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    if actor.user.role != UserRole.ADMIN and body.status is not None:
        raise ForbiddenError("Only admins may archive categories.", code="ADMIN_ONLY")
    row = inventory_service.update_category(db, category_id, body)
    db.commit()
    db.refresh(row)
    return inventory_service._category_dict(row)


@router.get("/products")
def list_products(
    category_id: uuid.UUID | None = None,
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_inventory_view(actor)
    rows = inventory_service.list_products(
        db, category_id=category_id, include_inactive=include_inactive
    )
    return {
        "items": [
            inventory_service._product_base_dict(r, category_name=r.category.name)
            for r in rows
        ]
    }


@router.get("/products/{product_id}")
def get_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_inventory_view(actor)
    return inventory_service.product_detail(db, product_id)


@router.post("/products")
def create_product(
    body: InventoryProductCreate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = inventory_service.create_product(db, actor=actor.user, body=body)
    db.commit()
    row = inventory_service.get_product(db, row.id)
    return inventory_service._product_base_dict(row, category_name=row.category.name)


@router.patch("/products/{product_id}")
def update_product(
    product_id: uuid.UUID,
    body: InventoryProductUpdate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = inventory_service.update_product(db, actor=actor.user, product_id=product_id, body=body)
    db.commit()
    row = inventory_service.get_product(db, row.id)
    return inventory_service._product_base_dict(row, category_name=row.category.name)


@router.post("/products/{product_id}/stock-in")
def stock_in(
    product_id: uuid.UUID,
    body: StockInBody,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    movement = inventory_service.stock_in(db, actor=actor.user, product_id=product_id, body=body)
    db.commit()
    product = inventory_service.get_product(db, product_id)
    return {
        "movement": inventory_service._movement_dict(movement, product_name=product.name),
        "product": inventory_service._product_base_dict(
            product, category_name=product.category.name
        ),
    }


@router.post("/products/{product_id}/adjust")
def adjust_stock(
    product_id: uuid.UUID,
    body: StockAdjustBody,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    inventory_service._assert_inventory_access(actor.user, admin_only=True)
    movement = inventory_service.adjust_stock(
        db, actor=actor.user, product_id=product_id, body=body
    )
    db.commit()
    product = inventory_service.get_product(db, product_id)
    return {
        "movement": inventory_service._movement_dict(movement, product_name=product.name),
        "product": inventory_service._product_base_dict(
            product, category_name=product.category.name
        ),
    }


@router.post("/sales")
def record_product_sale(
    body: ProductSaleCreate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    ledger_row, sale_row = inventory_service.create_product_sale(
        db, actor=actor.user, body=body
    )
    db.commit()
    db.refresh(ledger_row)
    product = inventory_service.get_product(db, sale_row.product_id)
    return {
        "ledger_entry_id": str(ledger_row.id),
        "index_label": ledger_service.index_label_for_entry(db, ledger_row),
        "amount": str(ledger_row.amount),
        "product_sale": {
            "id": str(sale_row.id),
            "product_id": str(sale_row.product_id),
            "product_name": product.name,
            "category_name": product.category.name,
            "quantity": sale_row.quantity,
            "unit_cost_price": str(sale_row.unit_cost_price),
            "unit_selling_price": str(sale_row.unit_selling_price),
            "revenue": str(sale_row.revenue),
            "cost": str(sale_row.cost),
            "profit": str(sale_row.profit),
            "recorded_by_user_id": str(ledger_row.created_by_user_id),
            "recorded_by_label": inventory_service._recorder_label(
                db, ledger_row.created_by_user_id
            ),
        },
    }


@router.get("/analytics/by-recorder")
def sales_by_recorder(
    preset: str = Query("month"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_inventory_view(actor)
    start, end = snapshot_time_bounds(
        db, preset, custom_from=from_date, custom_to=to_date
    )
    return {"items": inventory_service.sales_by_recorder_in_range(db, start=start, end=end)}


@router.get("/low-stock")
def low_stock_alerts(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_inventory_view(actor)
    inventory_service.reconcile_low_stock_notifications(db)
    db.commit()
    return {"items": inventory_service.low_stock_products(db)}


@router.get("/summary")
def inventory_summary(
    preset: str = Query("month"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_inventory_view(actor)
    start, end = snapshot_time_bounds(
        db, preset, custom_from=from_date, custom_to=to_date
    )
    totals = inventory_service.product_sales_totals_in_range(db, start=start, end=end)
    tz = shop_tz()
    all_time_start = datetime(2000, 1, 1, tzinfo=tz)
    all_time = inventory_service.product_sales_totals_in_range(
        db, start=all_time_start, end=end
    )
    from app.services import personal_consumption_service

    pc_period = personal_consumption_service.consumption_totals_for_datetime_range(
        db, start=start, end=end
    )
    payload: dict = {
        "inventory_value": str(inventory_service.inventory_value_total(db)),
        "period": {
            "product_revenue": str(totals["revenue"]),
            "product_cost": str(totals["cost"]),
            "product_profit": str(totals["profit"]),
            "personal_consumption": pc_period["personal_consumption_cost"],
        },
        "low_stock_count": len(inventory_service.low_stock_products(db, limit=500)),
        "personal_consumption": pc_period["personal_consumption_cost"],
    }
    if actor.user.role == UserRole.ADMIN:
        pc_all_time = personal_consumption_service.consumption_totals_for_datetime_range(
            db, start=all_time_start, end=end
        )
        payload["all_time"] = {
            "product_revenue": str(all_time["revenue"]),
            "product_cost": str(all_time["cost"]),
            "product_profit": str(all_time["profit"]),
            "personal_consumption": pc_all_time["personal_consumption_cost"],
        }
    return payload


@router.get("/analytics/products/{product_id}")
def product_analytics(
    product_id: uuid.UUID,
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_inventory_view(actor)
    return {
        "lifetime": inventory_service.product_analytics_for_product(db, product_id=product_id),
        "period": (
            inventory_service.product_analytics_for_product(
                db, product_id=product_id, year=year, month=month
            )
            if year and month
            else None
        ),
    }


@router.get("/analytics/by-employee")
def sales_by_employee(
    preset: str = Query("month"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_inventory_view(actor)
    start, end = snapshot_time_bounds(
        db, preset, custom_from=from_date, custom_to=to_date
    )
    return {"items": inventory_service.sales_by_employee_in_range(db, start=start, end=end)}
