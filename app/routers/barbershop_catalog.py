from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_actor_context, get_db
from app.models.catalog import ExpenseCategory, SaleCategory, ServiceType

router = APIRouter(prefix="/barbershop/catalog", tags=["barbershop"])


@router.get("/service-types")
def list_service_types(
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_actor_context),
) -> dict:
    rows = db.query(ServiceType).order_by(ServiceType.sort_order, ServiceType.name).all()
    return {"items": [{"id": str(r.id), "name": r.name, "is_active": r.is_active} for r in rows]}


@router.get("/sale-categories")
def list_sale_categories(
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_actor_context),
) -> dict:
    rows = db.query(SaleCategory).order_by(SaleCategory.sort_order, SaleCategory.name).all()
    return {"items": [{"id": str(r.id), "name": r.name, "is_active": r.is_active} for r in rows]}


@router.get("/expense-categories")
def list_expense_categories(
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_actor_context),
) -> dict:
    rows = (
        db.query(ExpenseCategory).order_by(ExpenseCategory.sort_order, ExpenseCategory.name).all()
    )
    return {"items": [{"id": str(r.id), "name": r.name, "is_active": r.is_active} for r in rows]}
