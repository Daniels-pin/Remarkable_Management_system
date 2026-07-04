from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_actor_context, get_db, get_manager_or_admin_actor
from app.core.exceptions import ForbiddenError
from app.models.enums import TeamAdvanceStatus, TeamAdvanceType, UserRole
from app.schemas.team_advance import (
    TeamAdvanceCashCreate,
    TeamAdvanceProductCreate,
    TeamAdvanceVoidBody,
)
from app.services import team_advance_service

router = APIRouter(prefix="/barbershop/team-advances", tags=["barbershop-team-advances"])


def _require_view(actor: ActorContext) -> None:
    if actor.user.role not in (
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.BARBER,
        UserRole.STAFF,
    ):
        raise ForbiddenError("Access denied.", code="FORBIDDEN")


@router.get("")
def list_team_advances(
    business_date: date | None = None,
    year: int | None = None,
    month: int | None = None,
    employee_user_id: uuid.UUID | None = None,
    status: TeamAdvanceStatus | None = None,
    advance_type: TeamAdvanceType | None = None,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> dict:
    _require_view(actor)
    rows = team_advance_service.list_advances(
        db,
        actor=actor.user,
        business_date=business_date,
        year=year,
        month=month,
        employee_user_id=employee_user_id,
        status=status,
        advance_type=advance_type,
    )
    return {
        "items": [team_advance_service.serialize_advance(r, db=db) for r in rows],
    }


@router.get("/report")
def team_advances_report(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    return team_advance_service.month_report(db, year=year, month=month)


@router.post("/cash")
def create_cash_advance(
    body: TeamAdvanceCashCreate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = team_advance_service.create_cash_advance(db, actor=actor.user, body=body)
    db.commit()
    db.refresh(row)
    row = team_advance_service.get_advance(db, row.id)
    return team_advance_service.serialize_advance(row, db=db)


@router.post("/product")
def create_product_advance(
    body: TeamAdvanceProductCreate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = team_advance_service.create_product_advance(db, actor=actor.user, body=body)
    db.commit()
    db.refresh(row)
    row = team_advance_service.get_advance(db, row.id)
    return team_advance_service.serialize_advance(row, db=db)


@router.post("/{advance_id}/void")
def void_team_advance(
    advance_id: uuid.UUID,
    body: TeamAdvanceVoidBody,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_manager_or_admin_actor),
) -> dict:
    row = team_advance_service.void_advance(
        db,
        actor=actor.user,
        advance_id=advance_id,
        void_reason=body.void_reason,
    )
    db.commit()
    row = team_advance_service.get_advance(db, row.id)
    return team_advance_service.serialize_advance(row, db=db)
