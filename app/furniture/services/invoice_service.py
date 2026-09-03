from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.furniture.models.enums import (
    FurnitureInvoicePaymentScenario,
    FurnitureInvoiceSource,
    FurnitureInvoiceStatus,
    FurnitureQuotationStatus,
)
from app.furniture.models.invoice import (
    FurnitureInvoice,
    FurnitureInvoiceItem,
    FurnitureInvoicePayment,
    FurnitureInvoiceSequenceCounter,
    FurnitureInvoiceStatusHistory,
)
from app.furniture.models.order import FurnitureOrder
from app.furniture.models.quotation import FurnitureQuotation
from app.furniture.schemas.invoices import (
    FurnitureInvoiceConvertPayment,
    FurnitureInvoiceCreate,
    FurnitureInvoiceNotesUpdate,
    FurnitureInvoicePaymentCreate,
    FurnitureInvoiceUpdate,
    FurnitureInvoiceVoidBody,
)
from app.models.user import User

INVOICE_NUMBER_PREFIX = "INV"


def _money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _format_invoice_number(year: int, index: int) -> str:
    return f"{INVOICE_NUMBER_PREFIX}-{year}-{index:04d}"


def allocate_invoice_sequence(db: Session, *, year: int | None = None) -> tuple[int, int]:
    calendar_year = year if year is not None else datetime.now(UTC).year
    counter = db.get(FurnitureInvoiceSequenceCounter, calendar_year)
    if counter is None:
        counter = FurnitureInvoiceSequenceCounter(calendar_year=calendar_year, next_index=1)
        db.add(counter)
        db.flush()
    index = counter.next_index
    counter.next_index = index + 1
    db.add(counter)
    return calendar_year, index


def _payment_total(invoice: FurnitureInvoice) -> Decimal:
    return _money(sum((p.amount for p in invoice.payments), Decimal("0")))


def _compute_grand_total(
    subtotal: Decimal, discount: Decimal, additional_charges: Decimal, tax: Decimal
) -> Decimal:
    discount = min(_money(discount), subtotal)
    return _money(subtotal - discount + additional_charges + tax)


def _is_overdue(invoice: FurnitureInvoice, balance_due: Decimal) -> bool:
    if balance_due <= 0:
        return False
    if invoice.status in (FurnitureInvoiceStatus.VOIDED, FurnitureInvoiceStatus.CANCELLED):
        return False
    if invoice.status == FurnitureInvoiceStatus.DRAFT:
        return False
    return invoice.due_date < date.today()


def _resolve_display_status(
    invoice: FurnitureInvoice, balance_due: Decimal
) -> FurnitureInvoiceStatus:
    if invoice.status in (FurnitureInvoiceStatus.VOIDED, FurnitureInvoiceStatus.CANCELLED):
        return invoice.status
    if invoice.status == FurnitureInvoiceStatus.DRAFT:
        return FurnitureInvoiceStatus.DRAFT
    if _is_overdue(invoice, balance_due):
        return FurnitureInvoiceStatus.OVERDUE
    if balance_due <= 0:
        if invoice.status == FurnitureInvoiceStatus.COMPLETED:
            return FurnitureInvoiceStatus.COMPLETED
        return FurnitureInvoiceStatus.PAID
    if _payment_total(invoice) > 0:
        return FurnitureInvoiceStatus.PARTIALLY_PAID
    return FurnitureInvoiceStatus.SENT


def _record_status_change(
    db: Session,
    invoice: FurnitureInvoice,
    status: FurnitureInvoiceStatus,
    *,
    note: str | None = None,
) -> None:
    if invoice.status_history and invoice.status_history[-1].status == status:
        return
    db.add(
        FurnitureInvoiceStatusHistory(
            invoice_id=invoice.id,
            status=status,
            note=note,
        )
    )


def _refresh_invoice_status(db: Session, invoice: FurnitureInvoice) -> FurnitureInvoiceStatus:
    if invoice.status in (FurnitureInvoiceStatus.VOIDED, FurnitureInvoiceStatus.CANCELLED):
        return invoice.status

    paid = _payment_total(invoice)
    balance = _money(invoice.grand_total - paid)

    if invoice.status == FurnitureInvoiceStatus.DRAFT:
        return FurnitureInvoiceStatus.DRAFT

    if balance <= 0:
        new_status = (
            FurnitureInvoiceStatus.COMPLETED
            if invoice.status == FurnitureInvoiceStatus.PAID
            else FurnitureInvoiceStatus.PAID
        )
    elif paid > 0:
        new_status = FurnitureInvoiceStatus.PARTIALLY_PAID
    else:
        new_status = FurnitureInvoiceStatus.SENT

    if _is_overdue(invoice, balance) and new_status in (
        FurnitureInvoiceStatus.SENT,
        FurnitureInvoiceStatus.PARTIALLY_PAID,
    ):
        new_status = FurnitureInvoiceStatus.OVERDUE

    if invoice.status != new_status:
        invoice.status = new_status
        _record_status_change(db, invoice, new_status)
        db.add(invoice)
    return new_status


def _payment_description(invoice: FurnitureInvoice, *, is_final: bool) -> str:
    count = len(invoice.payments)
    if count == 0:
        return "Advance Payment"
    if is_final:
        return "Final Payment"
    if count == 1:
        return "Second Payment"
    return f"Payment {count + 1}"


def _creator_display_name(db: Session, user_id: uuid.UUID | None) -> str | None:
    if not user_id:
        return None
    user = db.get(User, user_id)
    if not user:
        return None
    if user.profile and user.profile.full_name:
        return user.profile.full_name.strip()
    return user.username


def invoice_item_to_dict(row: FurnitureInvoiceItem) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "description": row.description,
        "quantity": row.quantity,
        "unit_price": float(row.unit_price),
        "line_total": float(row.line_total),
        "sort_order": row.sort_order,
    }


def payment_to_dict(row: FurnitureInvoicePayment) -> dict:
    return {
        "id": str(row.id),
        "amount": float(row.amount),
        "method": row.method,
        "reference": row.reference,
        "description": row.description,
        "payment_date": row.payment_date.isoformat(),
        "notes": row.notes,
        "recorded_at": row.recorded_at.isoformat(),
    }


def status_history_to_dict(row: FurnitureInvoiceStatusHistory) -> dict:
    return {
        "id": str(row.id),
        "status": row.status.value,
        "note": row.note,
        "recorded_at": row.recorded_at.isoformat(),
    }


def invoice_to_dict(db: Session, invoice: FurnitureInvoice) -> dict:
    amount_paid = _payment_total(invoice)
    balance_due = _money(max(Decimal("0"), invoice.grand_total - amount_paid))
    display_status = _resolve_display_status(invoice, balance_due)

    created_from = "Manual"
    if invoice.source == FurnitureInvoiceSource.QUOTATION and invoice.source_quotation_number:
        created_from = f"Quotation {invoice.source_quotation_number}"
    elif invoice.source == FurnitureInvoiceSource.ORDER and invoice.source_order_number:
        created_from = f"Order {invoice.source_order_number}"

    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "customer_name": invoice.customer_name,
        "customer_address": invoice.customer_address,
        "customer_phone": invoice.customer_phone,
        "customer_email": invoice.customer_email,
        "sales_representative": invoice.sales_representative,
        "date_issued": invoice.date_issued.isoformat(),
        "due_date": invoice.due_date.isoformat(),
        "payment_terms": invoice.payment_terms,
        "internal_notes": invoice.internal_notes,
        "source": invoice.source.value,
        "created_from": created_from,
        "source_quotation_id": str(invoice.source_quotation_id)
        if invoice.source_quotation_id
        else None,
        "source_quotation_number": invoice.source_quotation_number,
        "source_order_id": str(invoice.source_order_id) if invoice.source_order_id else None,
        "source_order_number": invoice.source_order_number,
        "status": display_status.value,
        "stored_status": invoice.status.value,
        "void_reason": invoice.void_reason,
        "voided_at": invoice.voided_at.isoformat() if invoice.voided_at else None,
        "subtotal": float(invoice.subtotal),
        "discount": float(invoice.discount),
        "additional_charges": float(invoice.additional_charges),
        "tax": float(invoice.tax),
        "grand_total": float(invoice.grand_total),
        "amount_paid": float(amount_paid),
        "balance_due": float(balance_due),
        "items": [invoice_item_to_dict(i) for i in invoice.items],
        "payments": [payment_to_dict(p) for p in invoice.payments],
        "status_history": [status_history_to_dict(h) for h in invoice.status_history],
        "created_by": _creator_display_name(db, invoice.created_by_user_id),
        "created_by_user_id": str(invoice.created_by_user_id)
        if invoice.created_by_user_id
        else None,
        "sent_at": invoice.sent_at.isoformat() if invoice.sent_at else None,
        "created_at": invoice.created_at.isoformat(),
        "updated_at": invoice.updated_at.isoformat(),
    }


def _load_invoice(db: Session, invoice_id: uuid.UUID) -> FurnitureInvoice:
    invoice = (
        db.query(FurnitureInvoice)
        .options(
            joinedload(FurnitureInvoice.items),
            joinedload(FurnitureInvoice.payments),
            joinedload(FurnitureInvoice.status_history),
        )
        .filter(FurnitureInvoice.id == invoice_id)
        .one_or_none()
    )
    if invoice is None:
        raise NotFoundError("Invoice not found.", code="FURNITURE_INVOICE_NOT_FOUND")
    return invoice


def _build_items(body_items) -> tuple[Decimal, list[FurnitureInvoiceItem]]:
    subtotal = Decimal("0")
    rows: list[FurnitureInvoiceItem] = []
    for idx, item in enumerate(body_items):
        if not item.name.strip():
            raise ValidationAppError("Each item must have a name.", code="ITEM_NAME_REQUIRED")
        if item.quantity <= 0:
            raise ValidationAppError("Quantity must be greater than zero.", code="INVALID_QUANTITY")
        if item.unit_price < 0:
            raise ValidationAppError("Unit price cannot be negative.", code="INVALID_UNIT_PRICE")
        line_total = _money(item.quantity * item.unit_price)
        subtotal += line_total
        rows.append(
            FurnitureInvoiceItem(
                sort_order=idx,
                name=item.name.strip(),
                description=item.description.strip() if item.description else None,
                quantity=item.quantity,
                unit_price=_money(item.unit_price),
                line_total=line_total,
            )
        )
    return _money(subtotal), rows


def _ensure_editable(invoice: FurnitureInvoice, *, financial: bool = False) -> None:
    if invoice.status == FurnitureInvoiceStatus.VOIDED:
        raise ValidationAppError("Voided invoices are read-only.", code="INVOICE_VOIDED")
    if financial and invoice.status in (
        FurnitureInvoiceStatus.PAID,
        FurnitureInvoiceStatus.COMPLETED,
    ):
        raise ValidationAppError(
            "Paid invoices cannot have financial values edited.", code="INVOICE_FINANCIAL_LOCKED"
        )


def _apply_initial_payment(
    db: Session,
    invoice: FurnitureInvoice,
    *,
    amount: Decimal,
    method: str,
    payment_date: date,
    reference: str | None,
) -> None:
    if amount <= 0:
        return
    if amount > invoice.grand_total:
        raise ValidationAppError(
            "Payment cannot exceed grand total.", code="PAYMENT_EXCEEDS_TOTAL"
        )
    balance_after = _money(invoice.grand_total - amount)
    db.add(
        FurnitureInvoicePayment(
            invoice_id=invoice.id,
            amount=_money(amount),
            method=method.strip(),
            reference=reference.strip() if reference else None,
            description=_payment_description(invoice, is_final=balance_after <= 0),
            payment_date=payment_date,
        )
    )


def create_invoice(
    db: Session, body: FurnitureInvoiceCreate, *, user_id: uuid.UUID | None = None
) -> FurnitureInvoice:
    subtotal, item_rows = _build_items(body.items)
    tax = _money(body.tax or Decimal("0"))
    grand_total = _compute_grand_total(
        subtotal, body.discount, body.additional_charges, tax
    )

    year, index = allocate_invoice_sequence(db)
    invoice_number = _format_invoice_number(year, index)

    invoice = FurnitureInvoice(
        invoice_number=invoice_number,
        sequence_year=year,
        sequence_index=index,
        customer_name=body.customer_name.strip(),
        customer_address=body.customer_address.strip() if body.customer_address else None,
        customer_phone=body.customer_phone.strip(),
        customer_email=body.customer_email.strip() if body.customer_email else None,
        sales_representative=body.sales_representative.strip()
        if body.sales_representative
        else None,
        date_issued=body.date_issued,
        due_date=body.due_date,
        payment_terms=body.payment_terms.strip() if body.payment_terms else None,
        internal_notes=body.internal_notes.strip() if body.internal_notes else None,
        source=FurnitureInvoiceSource.MANUAL,
        status=FurnitureInvoiceStatus.DRAFT,
        subtotal=subtotal,
        discount=_money(body.discount),
        additional_charges=_money(body.additional_charges),
        tax=tax,
        grand_total=grand_total,
        items=item_rows,
        created_by_user_id=user_id,
    )
    db.add(invoice)
    db.flush()
    _record_status_change(db, invoice, FurnitureInvoiceStatus.DRAFT, note="Invoice created")

    if body.advance_payment > 0:
        if not body.advance_payment_method:
            raise ValidationAppError(
                "Payment method is required for advance payment.",
                code="PAYMENT_METHOD_REQUIRED",
            )
        _apply_initial_payment(
            db,
            invoice,
            amount=body.advance_payment,
            method=body.advance_payment_method,
            payment_date=body.advance_payment_date or body.date_issued,
            reference=body.advance_payment_reference,
        )
        invoice.status = FurnitureInvoiceStatus.SENT
        invoice.sent_at = datetime.now(UTC)
        _record_status_change(db, invoice, FurnitureInvoiceStatus.SENT, note="Invoice sent")
        _refresh_invoice_status(db, invoice)

    db.flush()
    return _load_invoice(db, invoice.id)


def _period_bounds(period: str | None) -> tuple[date | None, date | None]:
    if not period or period == "all":
        return None, None
    today = date.today()
    if period == "today":
        return today, today
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start, today
    if period == "month":
        return today.replace(day=1), today
    if period == "year":
        return today.replace(month=1, day=1), today
    return None, None


def list_invoices(
    db: Session,
    *,
    search: str | None = None,
    status: str | None = None,
    customer: str | None = None,
    sales_representative: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    period: str | None = None,
) -> list[FurnitureInvoice]:
    q = (
        db.query(FurnitureInvoice)
        .options(
            joinedload(FurnitureInvoice.items),
            joinedload(FurnitureInvoice.payments),
            joinedload(FurnitureInvoice.status_history),
        )
        .order_by(FurnitureInvoice.created_at.desc())
    )

    period_from, period_to = _period_bounds(period)
    if period_from:
        date_from = period_from
    if period_to:
        date_to = period_to

    if date_from:
        q = q.filter(FurnitureInvoice.date_issued >= date_from)
    if date_to:
        q = q.filter(FurnitureInvoice.date_issued <= date_to)

    if customer and customer.strip():
        q = q.filter(FurnitureInvoice.customer_name.ilike(f"%{customer.strip()}%"))
    if sales_representative and sales_representative.strip():
        q = q.filter(
            FurnitureInvoice.sales_representative.ilike(f"%{sales_representative.strip()}%")
        )

    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                FurnitureInvoice.invoice_number.ilike(term),
                FurnitureInvoice.customer_name.ilike(term),
                FurnitureInvoice.customer_phone.ilike(term),
                FurnitureInvoice.source_order_number.ilike(term),
                FurnitureInvoice.source_quotation_number.ilike(term),
                FurnitureInvoice.items.any(FurnitureInvoiceItem.name.ilike(term)),
                FurnitureInvoice.payments.any(FurnitureInvoicePayment.reference.ilike(term)),
            )
        )

    rows = list(q.all())

    if status and status.strip() and status != "all":
        rows = [r for r in rows if _resolve_display_status(r, _money(r.grand_total - _payment_total(r))).value == status]

    return rows


def get_invoice(db: Session, invoice_id: uuid.UUID) -> FurnitureInvoice:
    return _load_invoice(db, invoice_id)


def update_invoice(
    db: Session, invoice_id: uuid.UUID, body: FurnitureInvoiceUpdate
) -> FurnitureInvoice:
    invoice = _load_invoice(db, invoice_id)
    _ensure_editable(invoice, financial=True)

    if invoice.status in (FurnitureInvoiceStatus.PAID, FurnitureInvoiceStatus.COMPLETED):
        raise ValidationAppError(
            "Only notes may be edited on paid invoices.", code="INVOICE_PAID_LOCKED"
        )

    subtotal, item_rows = _build_items(body.items)
    tax = _money(body.tax if body.tax is not None else invoice.tax)
    grand_total = _compute_grand_total(
        subtotal, body.discount, body.additional_charges, tax
    )
    paid = _payment_total(invoice)
    if paid > grand_total:
        raise ValidationAppError(
            "Grand total cannot be less than amount already paid.",
            code="TOTAL_BELOW_PAID",
        )

    invoice.customer_name = body.customer_name.strip()
    invoice.customer_address = body.customer_address.strip() if body.customer_address else None
    invoice.customer_phone = body.customer_phone.strip()
    invoice.customer_email = body.customer_email.strip() if body.customer_email else None
    invoice.sales_representative = (
        body.sales_representative.strip() if body.sales_representative else None
    )
    invoice.date_issued = body.date_issued
    invoice.due_date = body.due_date
    invoice.payment_terms = body.payment_terms.strip() if body.payment_terms else None
    invoice.internal_notes = body.internal_notes.strip() if body.internal_notes else None
    invoice.subtotal = subtotal
    invoice.discount = _money(body.discount)
    invoice.additional_charges = _money(body.additional_charges)
    invoice.tax = tax
    invoice.grand_total = grand_total

    invoice.items.clear()
    for item in item_rows:
        invoice.items.append(item)

    db.add(invoice)
    db.flush()
    _refresh_invoice_status(db, invoice)
    return _load_invoice(db, invoice.id)


def update_invoice_notes(
    db: Session, invoice_id: uuid.UUID, body: FurnitureInvoiceNotesUpdate
) -> FurnitureInvoice:
    invoice = _load_invoice(db, invoice_id)
    _ensure_editable(invoice)
    invoice.internal_notes = body.internal_notes.strip() if body.internal_notes else None
    invoice.payment_terms = body.payment_terms.strip() if body.payment_terms else None
    db.add(invoice)
    db.flush()
    return _load_invoice(db, invoice.id)


def send_invoice(db: Session, invoice_id: uuid.UUID) -> FurnitureInvoice:
    invoice = _load_invoice(db, invoice_id)
    if invoice.status != FurnitureInvoiceStatus.DRAFT:
        raise ValidationAppError("Only draft invoices can be sent.", code="INVOICE_NOT_DRAFT")
    invoice.status = FurnitureInvoiceStatus.SENT
    invoice.sent_at = datetime.now(UTC)
    _record_status_change(db, invoice, FurnitureInvoiceStatus.SENT, note="Invoice sent")
    db.add(invoice)
    db.flush()
    _refresh_invoice_status(db, invoice)
    return _load_invoice(db, invoice.id)


def record_payment(
    db: Session, invoice_id: uuid.UUID, body: FurnitureInvoicePaymentCreate
) -> FurnitureInvoice:
    invoice = _load_invoice(db, invoice_id)
    if invoice.status == FurnitureInvoiceStatus.VOIDED:
        raise ValidationAppError("Cannot record payment on voided invoice.", code="INVOICE_VOIDED")
    if invoice.status == FurnitureInvoiceStatus.CANCELLED:
        raise ValidationAppError(
            "Cannot record payment on cancelled invoice.", code="INVOICE_CANCELLED"
        )
    if invoice.status == FurnitureInvoiceStatus.DRAFT:
        raise ValidationAppError(
            "Send the invoice before recording payments.", code="INVOICE_NOT_SENT"
        )

    paid = _payment_total(invoice)
    balance = _money(invoice.grand_total - paid)
    if balance <= 0:
        raise ValidationAppError("Invoice is already fully paid.", code="INVOICE_FULLY_PAID")
    if body.amount > balance:
        raise ValidationAppError(
            f"Payment exceeds balance due ({balance}).", code="PAYMENT_EXCEEDS_BALANCE"
        )

    balance_after = _money(balance - body.amount)
    db.add(
        FurnitureInvoicePayment(
            invoice_id=invoice.id,
            amount=_money(body.amount),
            method=body.method.strip(),
            reference=body.reference.strip() if body.reference else None,
            description=_payment_description(invoice, is_final=balance_after <= 0),
            payment_date=body.payment_date,
            notes=body.notes.strip() if body.notes else None,
        )
    )
    db.flush()
    _refresh_invoice_status(db, invoice)
    return _load_invoice(db, invoice.id)


def void_invoice(
    db: Session, invoice_id: uuid.UUID, body: FurnitureInvoiceVoidBody
) -> FurnitureInvoice:
    invoice = _load_invoice(db, invoice_id)
    if invoice.status == FurnitureInvoiceStatus.VOIDED:
        raise ValidationAppError("Invoice is already voided.", code="INVOICE_ALREADY_VOIDED")
    invoice.status = FurnitureInvoiceStatus.VOIDED
    invoice.void_reason = body.reason.strip()
    invoice.voided_at = datetime.now(UTC)
    _record_status_change(
        db, invoice, FurnitureInvoiceStatus.VOIDED, note=body.reason.strip()
    )
    db.add(invoice)
    db.flush()
    return _load_invoice(db, invoice.id)


def delete_invoice(db: Session, invoice_id: uuid.UUID) -> None:
    invoice = _load_invoice(db, invoice_id)
    if invoice.status != FurnitureInvoiceStatus.DRAFT:
        raise ValidationAppError("Only draft invoices can be deleted.", code="INVOICE_NOT_DRAFT")
    db.delete(invoice)
    db.flush()


def duplicate_invoice(
    db: Session, invoice_id: uuid.UUID, *, user_id: uuid.UUID | None = None
) -> FurnitureInvoice:
    source = _load_invoice(db, invoice_id)
    year, index = allocate_invoice_sequence(db)
    invoice_number = _format_invoice_number(year, index)

    duplicate = FurnitureInvoice(
        invoice_number=invoice_number,
        sequence_year=year,
        sequence_index=index,
        customer_name=source.customer_name,
        customer_address=source.customer_address,
        customer_phone=source.customer_phone,
        customer_email=source.customer_email,
        sales_representative=source.sales_representative,
        date_issued=date.today(),
        due_date=source.due_date,
        payment_terms=source.payment_terms,
        internal_notes=source.internal_notes,
        source=FurnitureInvoiceSource.MANUAL,
        status=FurnitureInvoiceStatus.DRAFT,
        subtotal=source.subtotal,
        discount=source.discount,
        additional_charges=source.additional_charges,
        tax=source.tax,
        grand_total=source.grand_total,
        created_by_user_id=user_id,
        items=[
            FurnitureInvoiceItem(
                sort_order=item.sort_order,
                name=item.name,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for item in source.items
        ],
    )
    db.add(duplicate)
    db.flush()
    _record_status_change(db, duplicate, FurnitureInvoiceStatus.DRAFT, note="Duplicated invoice")
    return _load_invoice(db, duplicate.id)


def _apply_conversion_payment(
    db: Session,
    invoice: FurnitureInvoice,
    body: FurnitureInvoiceConvertPayment,
    grand_total: Decimal,
) -> None:
    scenario = body.payment_scenario
    if scenario == FurnitureInvoicePaymentScenario.NO_PAYMENT:
        invoice.status = FurnitureInvoiceStatus.SENT
        invoice.sent_at = datetime.now(UTC)
        _record_status_change(db, invoice, FurnitureInvoiceStatus.SENT, note="Converted to invoice")
        return

    if scenario == FurnitureInvoicePaymentScenario.ADVANCE_PAYMENT:
        if not body.payment_amount or body.payment_amount <= 0:
            raise ValidationAppError(
                "Advance payment amount is required.", code="PAYMENT_AMOUNT_REQUIRED"
            )
        if not body.payment_method:
            raise ValidationAppError(
                "Payment method is required.", code="PAYMENT_METHOD_REQUIRED"
            )
        if body.payment_amount >= grand_total:
            raise ValidationAppError(
                "Advance payment must be less than grand total.",
                code="ADVANCE_EXCEEDS_TOTAL",
            )
        _apply_initial_payment(
            db,
            invoice,
            amount=body.payment_amount,
            method=body.payment_method,
            payment_date=body.payment_date or date.today(),
            reference=body.payment_reference,
        )
        invoice.status = FurnitureInvoiceStatus.SENT
        invoice.sent_at = datetime.now(UTC)
        _record_status_change(db, invoice, FurnitureInvoiceStatus.SENT, note="Converted to invoice")
        _refresh_invoice_status(db, invoice)
        return

    if scenario == FurnitureInvoicePaymentScenario.PAID_IN_FULL:
        method = body.payment_method or "Cash"
        _apply_initial_payment(
            db,
            invoice,
            amount=grand_total,
            method=method,
            payment_date=body.payment_date or date.today(),
            reference=body.payment_reference,
        )
        invoice.status = FurnitureInvoiceStatus.SENT
        invoice.sent_at = datetime.now(UTC)
        _record_status_change(db, invoice, FurnitureInvoiceStatus.SENT, note="Converted to invoice")
        _refresh_invoice_status(db, invoice)


def convert_quotation_to_invoice(
    db: Session,
    quotation_id: uuid.UUID,
    body: FurnitureInvoiceConvertPayment,
    *,
    user_id: uuid.UUID | None = None,
) -> FurnitureInvoice:
    quotation = (
        db.query(FurnitureQuotation)
        .options(joinedload(FurnitureQuotation.items))
        .filter(FurnitureQuotation.id == quotation_id)
        .one_or_none()
    )
    if quotation is None:
        raise NotFoundError("Quotation not found.", code="FURNITURE_QUOTATION_NOT_FOUND")
    if quotation.converted_invoice_id:
        raise ValidationAppError(
            "Quotation already has an invoice.", code="QUOTATION_ALREADY_INVOICED"
        )
    if quotation.status == FurnitureQuotationStatus.DRAFT:
        raise ValidationAppError(
            "Finalize the quotation before converting to invoice.",
            code="QUOTATION_NOT_FINALIZED",
        )

    year, index = allocate_invoice_sequence(db)
    invoice_number = _format_invoice_number(year, index)
    due_date = body.due_date or (quotation.date_issued + timedelta(days=30))

    item_rows = [
        FurnitureInvoiceItem(
            sort_order=idx,
            name=item.name,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_total=item.line_total,
        )
        for idx, item in enumerate(quotation.items)
    ]

    invoice = FurnitureInvoice(
        invoice_number=invoice_number,
        sequence_year=year,
        sequence_index=index,
        customer_name=quotation.customer_name,
        customer_address=quotation.customer_address,
        customer_phone=quotation.customer_phone,
        sales_representative=body.sales_representative,
        date_issued=date.today(),
        due_date=due_date,
        payment_terms=body.payment_terms,
        source=FurnitureInvoiceSource.QUOTATION,
        source_quotation_id=quotation.id,
        source_quotation_number=quotation.quotation_number,
        status=FurnitureInvoiceStatus.DRAFT,
        subtotal=quotation.subtotal,
        discount=quotation.discount,
        additional_charges=Decimal("0"),
        tax=quotation.tax,
        grand_total=quotation.grand_total,
        items=item_rows,
        created_by_user_id=user_id,
    )
    db.add(invoice)
    db.flush()
    _record_status_change(db, invoice, FurnitureInvoiceStatus.DRAFT, note="Created from quotation")

    _apply_conversion_payment(db, invoice, body, quotation.grand_total)

    quotation.converted_invoice_id = invoice.id
    db.add(quotation)
    db.flush()
    return _load_invoice(db, invoice.id)


def convert_order_to_invoice(
    db: Session,
    order_id: uuid.UUID,
    body: FurnitureInvoiceConvertPayment,
    *,
    user_id: uuid.UUID | None = None,
) -> FurnitureInvoice:
    order = (
        db.query(FurnitureOrder)
        .options(joinedload(FurnitureOrder.items), joinedload(FurnitureOrder.payments))
        .filter(FurnitureOrder.id == order_id)
        .one_or_none()
    )
    if order is None:
        raise NotFoundError("Order not found.", code="FURNITURE_ORDER_NOT_FOUND")
    if order.converted_invoice_id:
        raise ValidationAppError("Order already has an invoice.", code="ORDER_ALREADY_INVOICED")

    year, index = allocate_invoice_sequence(db)
    invoice_number = _format_invoice_number(year, index)
    due_date = body.due_date or order.due_date

    item_rows = [
        FurnitureInvoiceItem(
            sort_order=idx,
            name=item.name,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_total=item.line_total,
        )
        for idx, item in enumerate(order.items)
    ]

    invoice = FurnitureInvoice(
        invoice_number=invoice_number,
        sequence_year=year,
        sequence_index=index,
        customer_name=order.customer_name,
        customer_address=order.customer_address,
        customer_phone=order.customer_phone,
        sales_representative=body.sales_representative,
        date_issued=date.today(),
        due_date=due_date,
        payment_terms=body.payment_terms,
        source=FurnitureInvoiceSource.ORDER,
        source_order_id=order.id,
        source_order_number=order.order_number,
        source_quotation_id=order.source_quotation_id,
        source_quotation_number=order.source_quotation_number,
        status=FurnitureInvoiceStatus.DRAFT,
        subtotal=order.subtotal,
        discount=Decimal("0"),
        additional_charges=Decimal("0"),
        tax=Decimal("0"),
        grand_total=order.grand_total,
        items=item_rows,
        created_by_user_id=user_id,
    )
    db.add(invoice)
    db.flush()
    _record_status_change(db, invoice, FurnitureInvoiceStatus.DRAFT, note="Created from order")

    existing_deposits = _money(sum((p.amount for p in order.payments), Decimal("0")))
    if existing_deposits > 0 and body.payment_scenario == FurnitureInvoicePaymentScenario.NO_PAYMENT:
        body = FurnitureInvoiceConvertPayment(
            payment_scenario=FurnitureInvoicePaymentScenario.ADVANCE_PAYMENT,
            payment_amount=existing_deposits,
            payment_method="Transfer",
            payment_date=date.today(),
            payment_reference=f"From order {order.order_number}",
            due_date=body.due_date,
            payment_terms=body.payment_terms,
            sales_representative=body.sales_representative,
        )

    _apply_conversion_payment(db, invoice, body, order.grand_total)

    order.converted_invoice_id = invoice.id
    db.add(order)
    db.flush()
    return _load_invoice(db, invoice.id)


def get_dashboard_summary(
    db: Session,
    *,
    period: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    period_from, period_to = _period_bounds(period)
    if period_from:
        date_from = period_from
    if period_to:
        date_to = period_to

    q = db.query(FurnitureInvoice).options(joinedload(FurnitureInvoice.payments))
    if date_from:
        q = q.filter(FurnitureInvoice.date_issued >= date_from)
    if date_to:
        q = q.filter(FurnitureInvoice.date_issued <= date_to)

    invoices = list(q.all())

    counts = {
        "draft": 0,
        "sent": 0,
        "partially_paid": 0,
        "paid": 0,
        "overdue": 0,
        "voided": 0,
        "cancelled": 0,
        "completed": 0,
    }
    outstanding_balance = Decimal("0")
    revenue_collected = Decimal("0")

    for inv in invoices:
        paid = _payment_total(inv)
        balance = _money(max(Decimal("0"), inv.grand_total - paid))
        status = _resolve_display_status(inv, balance).value
        if status in counts:
            counts[status] += 1
        if inv.status != FurnitureInvoiceStatus.VOIDED:
            outstanding_balance += balance
            revenue_collected += paid

    return {
        "total_invoices": len(invoices),
        "draft": counts["draft"],
        "sent": counts["sent"],
        "partially_paid": counts["partially_paid"],
        "paid": counts["paid"],
        "overdue": counts["overdue"],
        "voided": counts["voided"],
        "outstanding_balance": float(_money(outstanding_balance)),
        "revenue_collected": float(_money(revenue_collected)),
    }
