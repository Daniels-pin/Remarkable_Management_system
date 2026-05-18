from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_actor_context, get_db, get_manager_or_admin_actor
from app.schemas.catalog import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    SaleCategoryCreate,
    SaleCategoryUpdate,
    ServiceTypeCreate,
    ServiceTypeUpdate,
)
from app.services import catalog_service

router = APIRouter(prefix="/barbershop/catalog", tags=["barbershop"])


@router.get("/service-types")
def list_service_types(
    include_inactive: bool = Query(False, description="Include disabled and archived services"),
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_actor_context),
) -> dict:
    rows = catalog_service.list_service_types(db)
    items = [catalog_service.service_type_to_dict(r) for r in rows]
    if not include_inactive:
        items = [i for i in items if i["status"] == "active"]
    return {"items": items}


@router.post("/service-types")
def create_service_type(
    body: ServiceTypeCreate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = catalog_service.create_service_type(db, body)
    return catalog_service.service_type_to_dict(row)


@router.patch("/service-types/{service_type_id}")
def update_service_type(
    service_type_id: uuid.UUID,
    body: ServiceTypeUpdate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = catalog_service.update_service_type(db, service_type_id, body)
    return catalog_service.service_type_to_dict(row)


@router.get("/sale-categories")
def list_sale_categories(
    include_inactive: bool = Query(
        False, description="Include disabled and archived sale categories"
    ),
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_actor_context),
) -> dict:
    rows = catalog_service.list_sale_categories(db)
    items = [catalog_service.sale_category_to_dict(r) for r in rows]
    if not include_inactive:
        items = [i for i in items if i["status"] == "active"]
    return {"items": items}


@router.post("/sale-categories")
def create_sale_category(
    body: SaleCategoryCreate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = catalog_service.create_sale_category(db, body)
    return catalog_service.sale_category_to_dict(row)


@router.patch("/sale-categories/{category_id}")
def update_sale_category(
    category_id: uuid.UUID,
    body: SaleCategoryUpdate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = catalog_service.update_sale_category(db, category_id, body)
    return catalog_service.sale_category_to_dict(row)


@router.get("/expense-categories")
def list_expense_categories(
    include_inactive: bool = Query(
        False, description="Include disabled and archived expense categories"
    ),
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_actor_context),
) -> dict:
    rows = catalog_service.list_expense_categories(db)
    items = [catalog_service.expense_category_to_dict(r) for r in rows]
    if not include_inactive:
        items = [i for i in items if i["status"] == "active"]
    return {"items": items}


@router.post("/expense-categories")
def create_expense_category(
    body: ExpenseCategoryCreate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = catalog_service.create_expense_category(db, body)
    return catalog_service.expense_category_to_dict(row)


@router.patch("/expense-categories/{category_id}")
def update_expense_category(
    category_id: uuid.UUID,
    body: ExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = catalog_service.update_expense_category(db, category_id, body)
    return catalog_service.expense_category_to_dict(row)
