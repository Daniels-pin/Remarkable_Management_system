from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import ActorContext, get_admin_actor, get_db
from app.furniture.schemas.invoices import (
    FurnitureInvoiceConvertPayment,
    FurnitureInvoiceCreate,
    FurnitureInvoiceNotesUpdate,
    FurnitureInvoicePaymentCreate,
    FurnitureInvoiceUpdate,
    FurnitureInvoiceVoidBody,
)
from app.furniture.services import invoice_service, quotation_service
from app.furniture.services.invoice_pdf_service import generate_invoice_pdf

router = APIRouter(prefix="/furniture/invoices", tags=["furniture"])


@router.get("/dashboard/summary")
def invoice_dashboard_summary(
    period: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    return invoice_service.get_dashboard_summary(
        db, period=period, date_from=date_from, date_to=date_to
    )


@router.get("")
def list_invoices(
    q: str | None = Query(None),
    status: str | None = Query(None),
    customer: str | None = Query(None),
    sales_representative: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    period: str | None = Query(None),
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    rows = invoice_service.list_invoices(
        db,
        search=q,
        status=status,
        customer=customer,
        sales_representative=sales_representative,
        date_from=date_from,
        date_to=date_to,
        period=period,
    )
    return {"items": [invoice_service.invoice_to_dict(db, r) for r in rows]}


@router.post("")
def create_invoice(
    body: FurnitureInvoiceCreate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = invoice_service.create_invoice(db, body, user_id=actor.user.id)
    db.commit()
    return invoice_service.invoice_to_dict(db, row)


@router.post("/convert/quotation/{quotation_id}")
def convert_quotation_to_invoice(
    quotation_id: uuid.UUID,
    body: FurnitureInvoiceConvertPayment,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = invoice_service.convert_quotation_to_invoice(
        db, quotation_id, body, user_id=actor.user.id
    )
    db.commit()
    return invoice_service.invoice_to_dict(db, row)


@router.post("/convert/order/{order_id}")
def convert_order_to_invoice(
    order_id: uuid.UUID,
    body: FurnitureInvoiceConvertPayment,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = invoice_service.convert_order_to_invoice(db, order_id, body, user_id=actor.user.id)
    db.commit()
    return invoice_service.invoice_to_dict(db, row)


@router.get("/{invoice_id}")
def get_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = invoice_service.get_invoice(db, invoice_id)
    return invoice_service.invoice_to_dict(db, row)


@router.put("/{invoice_id}")
def update_invoice(
    invoice_id: uuid.UUID,
    body: FurnitureInvoiceUpdate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = invoice_service.update_invoice(db, invoice_id, body)
    db.commit()
    return invoice_service.invoice_to_dict(db, row)


@router.patch("/{invoice_id}/notes")
def update_invoice_notes(
    invoice_id: uuid.UUID,
    body: FurnitureInvoiceNotesUpdate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = invoice_service.update_invoice_notes(db, invoice_id, body)
    db.commit()
    return invoice_service.invoice_to_dict(db, row)


@router.post("/{invoice_id}/send")
def send_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = invoice_service.send_invoice(db, invoice_id)
    db.commit()
    return invoice_service.invoice_to_dict(db, row)


@router.post("/{invoice_id}/payments")
def record_payment(
    invoice_id: uuid.UUID,
    body: FurnitureInvoicePaymentCreate,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = invoice_service.record_payment(db, invoice_id, body)
    db.commit()
    return invoice_service.invoice_to_dict(db, row)


@router.post("/{invoice_id}/void")
def void_invoice(
    invoice_id: uuid.UUID,
    body: FurnitureInvoiceVoidBody,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = invoice_service.void_invoice(db, invoice_id, body)
    db.commit()
    return invoice_service.invoice_to_dict(db, row)


@router.post("/{invoice_id}/duplicate")
def duplicate_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_admin_actor),
) -> dict:
    row = invoice_service.duplicate_invoice(db, invoice_id, user_id=actor.user.id)
    db.commit()
    return invoice_service.invoice_to_dict(db, row)


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> dict:
    invoice_service.delete_invoice(db, invoice_id)
    db.commit()
    return {"deleted": True}


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: ActorContext = Depends(get_admin_actor),
) -> Response:
    invoice = invoice_service.get_invoice(db, invoice_id)
    settings = quotation_service.get_payment_settings(db)
    pdf_bytes = generate_invoice_pdf(invoice, settings)
    filename = f"{invoice.invoice_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
