from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_actor_context, get_db
from app.models.enums import UserRole
from app.services import inventory_service, notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    if actor.user.role in (UserRole.MANAGER, UserRole.ADMIN):
        inventory_service.reconcile_low_stock_notifications(db)
        db.commit()
    rows = notification_service.list_active_for_user(db, user_id=actor.user.id)
    return {
        "items": [
            {
                "id": str(n.id),
                "type": str(n.notification_type),
                "title": n.title,
                "body": n.body,
                "entity_type": n.entity_type,
                "entity_id": n.entity_id,
                "created_at": n.created_at.isoformat(),
            }
            for n in rows
        ]
    }
