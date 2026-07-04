from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_db, get_manager_or_admin_actor
from app.models.enums import PersonalConsumptionStatus
from app.schemas.personal_consumption import (
    PersonalConsumptionCreate,
    PersonalConsumptionVoidBody,
)
from app.services import personal_consumption_service

router = APIRouter(
    prefix="/barbershop/personal-consumption",
    tags=["barbershop-personal-consumption"],
)


@router.get("")
def list_personal_consumptions(
    business_date: date | None = None,
    year: int | None = None,
    month: int | None = None,
    status: PersonalConsumptionStatus | None = None,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    rows = personal_consumption_service.list_consumptions(
        db,
        actor=actor.user,
        business_date=business_date,
        year=year,
        month=month,
        status=status,
    )
    return {
        "items": [
            personal_consumption_service.serialize_consumption(r, db=db) for r in rows
        ],
    }


@router.get("/consumers")
def list_consumers(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    return {"items": personal_consumption_service.list_consumers(db)}


@router.get("/report")
def personal_consumption_report(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    return personal_consumption_service.month_report(db, year=year, month=month)


@router.post("")
def create_personal_consumption(
    body: PersonalConsumptionCreate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = personal_consumption_service.create_consumption(db, actor=actor.user, body=body)
    db.commit()
    db.refresh(row)
    row = personal_consumption_service.get_consumption(db, row.id)
    return personal_consumption_service.serialize_consumption(row, db=db)


@router.post("/{consumption_id}/void")
def void_personal_consumption(
    consumption_id: uuid.UUID,
    body: PersonalConsumptionVoidBody,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = personal_consumption_service.void_consumption(
        db,
        actor=actor.user,
        consumption_id=consumption_id,
        void_reason=body.void_reason,
    )
    db.commit()
    row = personal_consumption_service.get_consumption(db, row.id)
    return personal_consumption_service.serialize_consumption(row, db=db)
