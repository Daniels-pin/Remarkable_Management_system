from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_admin_actor, get_db
from app.furniture.schemas.quotations import (
    FurnitureQuotationAutosaveBody,
    FurnitureQuotationConvertBody,
    FurnitureQuotationCreate,
    FurnitureQuotationPaymentSettingsUpdate,
    FurnitureQuotationUpdate,
)
from app.furniture.services import order_service, quotation_pdf_service, quotation_service

router = APIRouter(prefix="/furniture/quotations", tags=["furniture"])


@router.get("")
def list_quotations(
    q: str | None = Query(None, description="Search by quote number, customer name, or phone"),
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    rows = quotation_service.list_quotations(db, search=q)
    return {"items": [quotation_service.quotation_to_dict(db, r) for r in rows]}


@router.post("")
def create_quotation(
    body: FurnitureQuotationCreate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = quotation_service.create_quotation(db, body, created_by_user_id=actor.user.id)
    db.commit()
    return quotation_service.quotation_to_dict(db, row)


@router.get("/payment-settings")
def get_payment_settings(
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    settings = quotation_service.get_payment_settings(db)
    return quotation_service.payment_settings_to_dict(settings)


@router.put("/payment-settings")
def update_payment_settings(
    body: FurnitureQuotationPaymentSettingsUpdate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    settings = quotation_service.update_payment_settings(db, body)
    db.commit()
    return quotation_service.payment_settings_to_dict(settings)


@router.get("/active-autosave")
def get_active_autosave(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = quotation_service.get_active_autosave_draft(db, user_id=actor.user.id)
    if row is None:
        return {"draft": None}
    return {"draft": quotation_service.quotation_to_dict(db, row)}


@router.put("/autosave")
def autosave_quotation(
    body: FurnitureQuotationAutosaveBody,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = quotation_service.autosave_quotation(db, body, user_id=actor.user.id)
    db.commit()
    return quotation_service.quotation_to_dict(db, row)


@router.delete("/active-autosave")
def discard_active_autosave(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_admin_actor),
) -> dict:
    discarded = quotation_service.discard_active_autosave_draft(db, user_id=actor.user.id)
    db.commit()
    return {"discarded": discarded}


@router.get("/{quotation_id}")
def get_quotation(
    quotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = quotation_service.get_quotation(db, quotation_id)
    return quotation_service.quotation_to_dict(db, row)


@router.put("/{quotation_id}")
def update_quotation(
    quotation_id: uuid.UUID,
    body: FurnitureQuotationUpdate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = quotation_service.update_quotation(db, quotation_id, body)
    db.commit()
    return quotation_service.quotation_to_dict(db, row)


@router.post("/{quotation_id}/finalize")
def finalize_quotation(
    quotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = quotation_service.finalize_quotation(db, quotation_id)
    db.commit()
    return quotation_service.quotation_to_dict(db, row)


@router.post("/{quotation_id}/convert")
def convert_quotation_to_order(
    quotation_id: uuid.UUID,
    body: FurnitureQuotationConvertBody,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    quotation, order = quotation_service.convert_quotation_to_order(db, quotation_id, body)
    db.commit()
    return {
        "quotation": quotation_service.quotation_to_dict(db, quotation),
        "order": order_service.order_to_dict(order),
    }


@router.get("/{quotation_id}/pdf")
def download_quotation_pdf(
    quotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> Response:
    quotation = quotation_service.get_quotation(db, quotation_id)
    settings = quotation_service.get_payment_settings(db)
    pdf_bytes = quotation_pdf_service.generate_quotation_pdf(quotation, settings)
    filename = f"{quotation.quotation_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
