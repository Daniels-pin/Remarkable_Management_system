from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.models.catalog import ExpenseCategory, SaleCategory, ServiceType
from app.models.enums import ServiceTypeStatus
from app.schemas.catalog import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    SaleCategoryCreate,
    SaleCategoryUpdate,
    ServiceTypeCreate,
    ServiceTypeUpdate,
)

DEFAULT_SERVICE_NAMES = (
    "Haircut",
    "Braiding",
    "Pedicure/Manicure",
    "Facials",
)

DEFAULT_SALE_CATEGORY_NAMES = (
    "Perfume",
    "Drinks",
    "Water",
    "Soft Drink",
    "Accessories",
    "Other",
)

DEFAULT_EXPENSE_CATEGORY_NAMES = (
    "Fuel",
    "Rent",
    "Electricity",
    "Internet",
    "Supplies",
    "Maintenance",
    "Salary",
)


def _sync_is_active(row: ServiceType) -> None:
    row.is_active = row.status == ServiceTypeStatus.ACTIVE


def service_type_to_dict(row: ServiceType) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "status": row.status,
        "is_active": row.status == ServiceTypeStatus.ACTIVE,
        "sort_order": row.sort_order,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def list_service_types(db: Session) -> list[ServiceType]:
    return db.query(ServiceType).order_by(ServiceType.sort_order, ServiceType.name).all()


def get_service_type(db: Session, service_type_id: uuid.UUID) -> ServiceType:
    row = db.get(ServiceType, service_type_id)
    if not row:
        raise NotFoundError("Service not found.", code="SERVICE_NOT_FOUND")
    return row


def assert_service_type_selectable(db: Session, service_type_id: uuid.UUID) -> ServiceType:
    row = get_service_type(db, service_type_id)
    if row.status != ServiceTypeStatus.ACTIVE:
        raise ValidationAppError(
            "This service is not available for new entries.",
            code="SERVICE_NOT_SELECTABLE",
        )
    return row


def create_service_type(db: Session, body: ServiceTypeCreate) -> ServiceType:
    name = body.name.strip()
    if not name:
        raise ValidationAppError("Service name is required.", code="BAD_NAME")

    existing = (
        db.query(ServiceType)
        .filter(ServiceType.name.ilike(name))
        .first()
    )
    if existing:
        raise ConflictError("A service with this name already exists.", code="SERVICE_NAME_TAKEN")

    max_sort = db.query(ServiceType.sort_order).order_by(ServiceType.sort_order.desc()).first()
    next_sort = (max_sort[0] if max_sort else 0) + 1

    row = ServiceType(
        name=name,
        status=body.status,
        sort_order=next_sort,
    )
    _sync_is_active(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_service_type(
    db: Session,
    service_type_id: uuid.UUID,
    body: ServiceTypeUpdate,
) -> ServiceType:
    row = get_service_type(db, service_type_id)

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise ValidationAppError("Service name is required.", code="BAD_NAME")
        duplicate = (
            db.query(ServiceType)
            .filter(ServiceType.id != row.id, ServiceType.name.ilike(name))
            .first()
        )
        if duplicate:
            raise ConflictError("A service with this name already exists.", code="SERVICE_NAME_TAKEN")
        row.name = name

    if body.status is not None:
        row.status = body.status
        _sync_is_active(row)

    db.commit()
    db.refresh(row)
    return row


def seed_default_service_types(db: Session) -> int:
    created = 0
    for index, name in enumerate(DEFAULT_SERVICE_NAMES):
        exists = db.query(ServiceType).filter(ServiceType.name.ilike(name)).first()
        if exists:
            continue
        row = ServiceType(name=name, status=ServiceTypeStatus.ACTIVE, sort_order=index)
        _sync_is_active(row)
        db.add(row)
        created += 1
    if created:
        db.commit()
    return created


def _sync_category_is_active(row: SaleCategory | ExpenseCategory) -> None:
    row.is_active = row.status == ServiceTypeStatus.ACTIVE


def sale_category_to_dict(row: SaleCategory) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "status": row.status,
        "is_active": row.status == ServiceTypeStatus.ACTIVE,
        "sort_order": row.sort_order,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def expense_category_to_dict(row: ExpenseCategory) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "status": row.status,
        "is_active": row.status == ServiceTypeStatus.ACTIVE,
        "sort_order": row.sort_order,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def list_sale_categories(db: Session) -> list[SaleCategory]:
    return db.query(SaleCategory).order_by(SaleCategory.sort_order, SaleCategory.name).all()


def list_expense_categories(db: Session) -> list[ExpenseCategory]:
    return (
        db.query(ExpenseCategory).order_by(ExpenseCategory.sort_order, ExpenseCategory.name).all()
    )


def get_sale_category(db: Session, category_id: uuid.UUID) -> SaleCategory:
    row = db.get(SaleCategory, category_id)
    if not row:
        raise NotFoundError("Sale category not found.", code="SALE_CATEGORY_NOT_FOUND")
    return row


def get_expense_category(db: Session, category_id: uuid.UUID) -> ExpenseCategory:
    row = db.get(ExpenseCategory, category_id)
    if not row:
        raise NotFoundError("Expense category not found.", code="EXPENSE_CATEGORY_NOT_FOUND")
    return row


def assert_sale_category_selectable(db: Session, category_id: uuid.UUID) -> SaleCategory:
    row = get_sale_category(db, category_id)
    if row.status != ServiceTypeStatus.ACTIVE:
        raise ValidationAppError(
            "This sale category is not available for new entries.",
            code="SALE_CATEGORY_NOT_SELECTABLE",
        )
    return row


def assert_expense_category_selectable(db: Session, category_id: uuid.UUID) -> ExpenseCategory:
    row = get_expense_category(db, category_id)
    if row.status != ServiceTypeStatus.ACTIVE:
        raise ValidationAppError(
            "This expense category is not available for new entries.",
            code="EXPENSE_CATEGORY_NOT_SELECTABLE",
        )
    return row


def create_sale_category(db: Session, body: SaleCategoryCreate) -> SaleCategory:
    name = body.name.strip()
    if not name:
        raise ValidationAppError("Category name is required.", code="BAD_NAME")

    existing = db.query(SaleCategory).filter(SaleCategory.name.ilike(name)).first()
    if existing:
        raise ConflictError(
            "A sale category with this name already exists.",
            code="SALE_CATEGORY_NAME_TAKEN",
        )

    max_sort = db.query(SaleCategory.sort_order).order_by(SaleCategory.sort_order.desc()).first()
    next_sort = (max_sort[0] if max_sort else 0) + 1

    row = SaleCategory(name=name, status=body.status, sort_order=next_sort)
    _sync_category_is_active(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_sale_category(
    db: Session,
    category_id: uuid.UUID,
    body: SaleCategoryUpdate,
) -> SaleCategory:
    row = get_sale_category(db, category_id)

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise ValidationAppError("Category name is required.", code="BAD_NAME")
        duplicate = (
            db.query(SaleCategory)
            .filter(SaleCategory.id != row.id, SaleCategory.name.ilike(name))
            .first()
        )
        if duplicate:
            raise ConflictError(
                "A sale category with this name already exists.",
                code="SALE_CATEGORY_NAME_TAKEN",
            )
        row.name = name

    if body.status is not None:
        row.status = body.status
        _sync_category_is_active(row)

    db.commit()
    db.refresh(row)
    return row


def create_expense_category(db: Session, body: ExpenseCategoryCreate) -> ExpenseCategory:
    name = body.name.strip()
    if not name:
        raise ValidationAppError("Category name is required.", code="BAD_NAME")

    existing = db.query(ExpenseCategory).filter(ExpenseCategory.name.ilike(name)).first()
    if existing:
        raise ConflictError(
            "An expense category with this name already exists.",
            code="EXPENSE_CATEGORY_NAME_TAKEN",
        )

    max_sort = (
        db.query(ExpenseCategory.sort_order).order_by(ExpenseCategory.sort_order.desc()).first()
    )
    next_sort = (max_sort[0] if max_sort else 0) + 1

    row = ExpenseCategory(name=name, status=body.status, sort_order=next_sort)
    _sync_category_is_active(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_expense_category(
    db: Session,
    category_id: uuid.UUID,
    body: ExpenseCategoryUpdate,
) -> ExpenseCategory:
    row = get_expense_category(db, category_id)

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise ValidationAppError("Category name is required.", code="BAD_NAME")
        duplicate = (
            db.query(ExpenseCategory)
            .filter(ExpenseCategory.id != row.id, ExpenseCategory.name.ilike(name))
            .first()
        )
        if duplicate:
            raise ConflictError(
                "An expense category with this name already exists.",
                code="EXPENSE_CATEGORY_NAME_TAKEN",
            )
        row.name = name

    if body.status is not None:
        row.status = body.status
        _sync_category_is_active(row)

    db.commit()
    db.refresh(row)
    return row


def seed_default_sale_categories(db: Session) -> int:
    created = 0
    for index, name in enumerate(DEFAULT_SALE_CATEGORY_NAMES):
        exists = db.query(SaleCategory).filter(SaleCategory.name.ilike(name)).first()
        if exists:
            continue
        row = SaleCategory(name=name, status=ServiceTypeStatus.ACTIVE, sort_order=index)
        _sync_category_is_active(row)
        db.add(row)
        created += 1
    if created:
        db.commit()
    return created


def seed_default_expense_categories(db: Session) -> int:
    created = 0
    for index, name in enumerate(DEFAULT_EXPENSE_CATEGORY_NAMES):
        exists = db.query(ExpenseCategory).filter(ExpenseCategory.name.ilike(name)).first()
        if exists:
            continue
        row = ExpenseCategory(name=name, status=ServiceTypeStatus.ACTIVE, sort_order=index)
        _sync_category_is_active(row)
        db.add(row)
        created += 1
    if created:
        db.commit()
    return created
