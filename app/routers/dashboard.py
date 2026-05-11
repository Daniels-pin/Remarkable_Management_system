from fastapi import APIRouter, Depends

from app.core.deps import ActorContext, get_actor_context

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def dashboard_summary(
    _: ActorContext = Depends(get_actor_context),
) -> dict:
    return {
        "presets": ["today", "week", "month", "year", "all_time", "custom"],
        "note": "Aggregate services, sales, expenses, payroll; respect role and month state.",
    }
