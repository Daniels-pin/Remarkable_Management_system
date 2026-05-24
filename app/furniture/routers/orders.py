from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_admin_actor, get_db
from app.furniture.schemas.orders import (
    FurnitureOrderCreate,
    FurnitureOrderDepositCreate,
    FurnitureOrderStatusUpdate,
)
from app.furniture.services import order_service

router = APIRouter(prefix="/furniture/orders", tags=["furniture"])


@router.get("")
def list_orders(
    q: str | None = Query(None, description="Search by order ID, customer name, or phone"),
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    rows = order_service.list_orders(db, search=q)
    return {"items": [order_service.order_to_dict(r) for r in rows]}


@router.post("")
def create_order(
    body: FurnitureOrderCreate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = order_service.create_order(db, body)
    db.commit()
    return order_service.order_to_dict(row)


@router.get("/{order_id}")
def get_order(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = order_service.get_order(db, order_id)
    return order_service.order_to_dict(row)


@router.patch("/{order_id}/status")
def update_order_status(
    order_id: uuid.UUID,
    body: FurnitureOrderStatusUpdate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = order_service.update_order_status(db, order_id, body)
    db.commit()
    return order_service.order_to_dict(row)


@router.post("/{order_id}/deposits")
def record_deposit(
    order_id: uuid.UUID,
    body: FurnitureOrderDepositCreate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = order_service.record_deposit(db, order_id, body)
    db.commit()
    return order_service.order_to_dict(row)
