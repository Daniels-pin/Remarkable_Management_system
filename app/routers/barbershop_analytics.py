from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from app.core.deps import ActorContext, get_db, get_manager_or_admin_actor
from app.core.exceptions import ValidationAppError
from app.models.enums import UserRole
from app.services import operations_analytics_service
from sqlalchemy.orm import Session

router = APIRouter(prefix="/barbershop/analytics", tags=["barbershop"])

_MANAGER_PRESETS = frozenset({"today", "week", "month"})


@router.get("/summary")
def operations_summary(
    preset: str = Query("month", pattern="^(today|week|month|year|all|custom)$"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    if actor.user.role == UserRole.MANAGER and preset not in _MANAGER_PRESETS:
        raise ValidationAppError(
            "Managers may only view today, week, or month summaries.",
            code="MANAGER_PRESET_FORBIDDEN",
        )
    start, end = operations_analytics_service.snapshot_time_bounds(
        db,
        preset,
        custom_from=from_date,
        custom_to=to_date,
    )
    snapshot = operations_analytics_service.financial_snapshot(db, start=start, end=end)
    return operations_analytics_service.shape_summary_for_role(snapshot, actor.user.role)
