from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_admin_actor, get_db
from app.furniture.services import order_service

router = APIRouter(prefix="/furniture/dashboard", tags=["furniture"])


@router.get("/summary")
def dashboard_summary(
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    return order_service.get_dashboard_summary(db)
