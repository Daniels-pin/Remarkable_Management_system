from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.furniture.models.enums import FurnitureOrderStatus, FurnitureQuotationStatus
from app.furniture.models.invoice import FurnitureInvoice
from app.furniture.models.order import (
    FurnitureOrder,
    FurnitureOrderItem,
    FurnitureOrderSequenceCounter,
)
from app.furniture.models.quotation import (
    FurnitureQuotation,
    FurnitureQuotationItem,
    FurnitureQuotationPaymentSettings,
    FurnitureQuotationSection,
    FurnitureQuotationSequenceCounter,
)
from app.furniture.schemas.quotations import (
    FurnitureQuotationAutosaveBody,
    FurnitureQuotationConvertBody,
    FurnitureQuotationCreate,
    FurnitureQuotationPaymentSettingsUpdate,
    FurnitureQuotationUpdate,
)
from app.models.user import User

QUOTATION_NUMBER_PREFIX = "QUO"
AUTOSAVE_CUSTOMER_NAME = "Draft"
AUTOSAVE_CUSTOMER_PHONE = "-"
AUTOSAVE_SECTION_TITLE = "Section"
DEFAULT_TERMS = "This document is a quotation for pricing and negotiation only."
DEFAULT_PRIMARY_PHONE = "+234 901 246 2061"
DEFAULT_SECONDARY_PHONE = "+234 706 097 9362"
DEFAULT_INSTAGRAM_HANDLE = "remarkable_furniture"
DEFAULT_COMPANY_ADDRESS = "Shinko Factory, Little Rayfield, Jos, Plateau State"


def _money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _format_quotation_number(year: int, index: int) -> str:
    return f"{QUOTATION_NUMBER_PREFIX}-{year}-{index:03d}"


def allocate_quotation_sequence(db: Session, *, year: int | None = None) -> tuple[int, int]:
    calendar_year = year if year is not None else datetime.now(UTC).year
    counter = db.get(FurnitureQuotationSequenceCounter, calendar_year)
    if counter is None:
        counter = FurnitureQuotationSequenceCounter(calendar_year=calendar_year, next_index=1)
        db.add(counter)
        db.flush()
    index = counter.next_index
    counter.next_index = index + 1
    db.add(counter)
    return calendar_year, index


def _build_item_row(item, *, sort_order: int) -> tuple[Decimal, FurnitureQuotationItem]:
    if not item.name.strip():
        raise ValidationAppError(
            "Each quotation item must have a name.", code="ITEM_NAME_REQUIRED"
        )
    if item.quantity <= 0:
        raise ValidationAppError("Quantity must be greater than zero.", code="INVALID_QUANTITY")
    if item.unit_price < 0:
        raise ValidationAppError("Unit price cannot be negative.", code="INVALID_UNIT_PRICE")
    line_total = _money(item.quantity * item.unit_price)
    row = FurnitureQuotationItem(
        sort_order=sort_order,
        name=item.name.strip(),
        description=item.description.strip() if item.description else None,
        quantity=item.quantity,
        unit_price=_money(item.unit_price),
        line_total=line_total,
    )
    return line_total, row


def _build_sections(
    sections: list,
) -> tuple[Decimal, list[FurnitureQuotationSection]]:
    subtotal = Decimal("0")
    section_rows: list[FurnitureQuotationSection] = []
    priced_item_count = 0

    for section_idx, section in enumerate(sections):
        title = section.title.strip()
        if not title:
            raise ValidationAppError(
                "Each section subheading must have a title.", code="SECTION_TITLE_REQUIRED"
            )

        section_row = FurnitureQuotationSection(
            sort_order=section_idx,
            title=title,
        )
        section_items: list[FurnitureQuotationItem] = []

        for item_idx, item in enumerate(section.items):
            line_total, item_row = _build_item_row(item, sort_order=item_idx)
            subtotal += line_total
            priced_item_count += 1
            section_items.append(item_row)

        section_row.items = section_items
        section_rows.append(section_row)

    if priced_item_count == 0:
        raise ValidationAppError(
            "Quotation must have at least one priced item.", code="QUOTATION_EMPTY"
        )

    return _money(subtotal), section_rows


def _build_item_row_autosave(
    item, *, sort_order: int
) -> tuple[Decimal, FurnitureQuotationItem] | None:
    name = item.name.strip()
    if not name:
        return None
    quantity = max(0, int(item.quantity))
    unit_price = _money(item.unit_price)
    line_total = _money(quantity * unit_price) if quantity > 0 else Decimal("0.00")
    row = FurnitureQuotationItem(
        sort_order=sort_order,
        name=name,
        description=item.description.strip() if item.description else None,
        quantity=quantity if quantity > 0 else 1,
        unit_price=unit_price,
        line_total=line_total if quantity > 0 else Decimal("0.00"),
    )
    return line_total if quantity > 0 else Decimal("0.00"), row


def _build_sections_autosave(
    sections: list,
) -> tuple[Decimal, list[FurnitureQuotationSection]]:
    subtotal = Decimal("0")
    section_rows: list[FurnitureQuotationSection] = []

    if not sections:
        return Decimal("0"), [
            FurnitureQuotationSection(sort_order=0, title=AUTOSAVE_SECTION_TITLE, items=[])
        ]

    for section_idx, section in enumerate(sections):
        title = section.title.strip() or AUTOSAVE_SECTION_TITLE
        section_row = FurnitureQuotationSection(
            sort_order=section_idx,
            title=title,
        )
        section_items: list[FurnitureQuotationItem] = []

        for item_idx, item in enumerate(section.items):
            built = _build_item_row_autosave(item, sort_order=item_idx)
            if built is None:
                continue
            line_total, item_row = built
            subtotal += line_total
            section_items.append(item_row)

        section_row.items = section_items
        section_rows.append(section_row)

    return _money(subtotal), section_rows


def _build_item_rows(items: list) -> tuple[Decimal, list[FurnitureQuotationItem]]:
    subtotal = Decimal("0")
    item_rows: list[FurnitureQuotationItem] = []
    for idx, item in enumerate(items):
        line_total, row = _build_item_row(item, sort_order=idx)
        subtotal += line_total
        item_rows.append(row)
    return _money(subtotal), item_rows


def _compute_grand_total(subtotal: Decimal, discount: Decimal, tax: Decimal) -> Decimal:
    discount = _money(discount)
    tax = _money(tax)
    if discount > subtotal:
        raise ValidationAppError("Discount cannot exceed subtotal.", code="INVALID_DISCOUNT")
    return _money(subtotal - discount + tax)


def _creator_display_name(db: Session, user_id: uuid.UUID | None) -> str | None:
    if user_id is None:
        return None
    user = db.get(User, user_id)
    if user is None:
        return None
    if user.profile and user.profile.full_name:
        return user.profile.full_name.strip()
    return user.username


def quotation_item_to_dict(row: FurnitureQuotationItem) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "description": row.description,
        "quantity": row.quantity,
        "unit_price": float(row.unit_price),
        "line_total": float(row.line_total),
        "sort_order": row.sort_order,
        "section_id": str(row.section_id) if row.section_id else None,
    }


def quotation_section_to_dict(section: FurnitureQuotationSection) -> dict:
    return {
        "id": str(section.id),
        "title": section.title,
        "sort_order": section.sort_order,
        "items": [quotation_item_to_dict(item) for item in section.items],
    }


def quotation_to_dict(db: Session, quotation: FurnitureQuotation) -> dict:
    converted_order_number = None
    if quotation.converted_order_id:
        order = db.get(FurnitureOrder, quotation.converted_order_id)
        if order:
            converted_order_number = order.order_number

    converted_invoice_number = None
    if quotation.converted_invoice_id:
        invoice = db.get(FurnitureInvoice, quotation.converted_invoice_id)
        if invoice:
            converted_invoice_number = invoice.invoice_number

    return {
        "id": str(quotation.id),
        "quotation_number": quotation.quotation_number,
        "customer_name": quotation.customer_name,
        "customer_address": quotation.customer_address,
        "customer_phone": quotation.customer_phone,
        "date_issued": quotation.date_issued.isoformat(),
        "status": quotation.status.value,
        "subtotal": float(quotation.subtotal),
        "discount": float(quotation.discount),
        "tax": float(quotation.tax),
        "grand_total": float(quotation.grand_total),
        "sections": [quotation_section_to_dict(section) for section in quotation.sections],
        "items": [quotation_item_to_dict(i) for i in quotation.items],
        "created_by": _creator_display_name(db, quotation.created_by_user_id),
        "created_by_user_id": str(quotation.created_by_user_id)
        if quotation.created_by_user_id
        else None,
        "converted_order_id": str(quotation.converted_order_id)
        if quotation.converted_order_id
        else None,
        "converted_order_number": converted_order_number,
        "converted_invoice_id": str(quotation.converted_invoice_id)
        if quotation.converted_invoice_id
        else None,
        "converted_invoice_number": converted_invoice_number,
        "created_at": quotation.created_at.isoformat(),
        "updated_at": quotation.updated_at.isoformat(),
        "is_autosave_session": quotation.is_autosave_session,
    }


def payment_settings_to_dict(settings: FurnitureQuotationPaymentSettings) -> dict:
    return {
        "account_name": settings.account_name,
        "account_number": settings.account_number,
        "bank_name": settings.bank_name,
        "terms_text": settings.terms_text,
        "primary_phone": settings.primary_phone,
        "secondary_phone": settings.secondary_phone,
        "instagram_handle": settings.instagram_handle,
        "company_address": settings.company_address,
    }


def _load_quotation(db: Session, quotation_id: uuid.UUID) -> FurnitureQuotation:
    quotation = (
        db.query(FurnitureQuotation)
        .options(
            joinedload(FurnitureQuotation.sections).joinedload(FurnitureQuotationSection.items),
            joinedload(FurnitureQuotation.items),
        )
        .filter(FurnitureQuotation.id == quotation_id)
        .one_or_none()
    )
    if quotation is None:
        raise NotFoundError("Quotation not found.", code="FURNITURE_QUOTATION_NOT_FOUND")
    return quotation


def _ensure_editable(quotation: FurnitureQuotation) -> None:
    if quotation.status == FurnitureQuotationStatus.CONVERTED:
        raise ValidationAppError(
            "Converted quotations cannot be edited.", code="QUOTATION_CONVERTED"
        )


def get_or_create_payment_settings(db: Session) -> FurnitureQuotationPaymentSettings:
    settings = db.get(FurnitureQuotationPaymentSettings, 1)
    if settings is None:
        settings = FurnitureQuotationPaymentSettings(
            id=1,
            terms_text=DEFAULT_TERMS,
            primary_phone=DEFAULT_PRIMARY_PHONE,
            secondary_phone=DEFAULT_SECONDARY_PHONE,
            instagram_handle=DEFAULT_INSTAGRAM_HANDLE,
            company_address=DEFAULT_COMPANY_ADDRESS,
        )
        db.add(settings)
        db.flush()
    return settings


def get_payment_settings(db: Session) -> FurnitureQuotationPaymentSettings:
    return get_or_create_payment_settings(db)


def update_payment_settings(
    db: Session, body: FurnitureQuotationPaymentSettingsUpdate
) -> FurnitureQuotationPaymentSettings:
    settings = get_or_create_payment_settings(db)
    if body.account_name is not None:
        settings.account_name = body.account_name.strip() or None
    if body.account_number is not None:
        settings.account_number = body.account_number.strip() or None
    if body.bank_name is not None:
        settings.bank_name = body.bank_name.strip() or None
    if body.terms_text is not None:
        text = body.terms_text.strip()
        if not text:
            raise ValidationAppError("Terms text cannot be empty.", code="TERMS_REQUIRED")
        settings.terms_text = text
    if body.primary_phone is not None:
        settings.primary_phone = body.primary_phone.strip() or None
    if body.secondary_phone is not None:
        settings.secondary_phone = body.secondary_phone.strip() or None
    if body.instagram_handle is not None:
        handle = body.instagram_handle.strip().lstrip("@")
        settings.instagram_handle = handle or None
    if body.company_address is not None:
        settings.company_address = body.company_address.strip() or None
    db.add(settings)
    db.flush()
    return settings


def create_quotation(
    db: Session, body: FurnitureQuotationCreate, *, created_by_user_id: uuid.UUID
) -> FurnitureQuotation:
    subtotal, section_rows = _build_sections(body.sections)
    grand_total = _compute_grand_total(subtotal, body.discount, body.tax)

    year, index = allocate_quotation_sequence(db)
    quotation_number = _format_quotation_number(year, index)

    quotation = FurnitureQuotation(
        quotation_number=quotation_number,
        sequence_year=year,
        sequence_index=index,
        customer_name=body.customer_name.strip(),
        customer_address=body.customer_address.strip() if body.customer_address else None,
        customer_phone=body.customer_phone.strip(),
        date_issued=body.date_issued,
        status=FurnitureQuotationStatus.DRAFT,
        is_autosave_session=False,
        subtotal=subtotal,
        discount=_money(body.discount),
        tax=_money(body.tax),
        grand_total=grand_total,
        created_by_user_id=created_by_user_id,
    )
    for section in section_rows:
        for item in section.items:
            item.quotation = quotation
        quotation.sections.append(section)
    db.add(quotation)
    db.flush()
    return _load_quotation(db, quotation.id)


def list_quotations(db: Session, *, search: str | None = None) -> list[FurnitureQuotation]:
    q = (
        db.query(FurnitureQuotation)
        .options(
            joinedload(FurnitureQuotation.sections).joinedload(FurnitureQuotationSection.items),
            joinedload(FurnitureQuotation.items),
        )
        .filter(FurnitureQuotation.is_autosave_session.is_(False))
        .order_by(FurnitureQuotation.created_at.desc())
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                FurnitureQuotation.quotation_number.ilike(term),
                FurnitureQuotation.customer_name.ilike(term),
                FurnitureQuotation.customer_phone.ilike(term),
            )
        )
    return list(q.all())


def get_quotation(db: Session, quotation_id: uuid.UUID) -> FurnitureQuotation:
    return _load_quotation(db, quotation_id)


def update_quotation(
    db: Session, quotation_id: uuid.UUID, body: FurnitureQuotationUpdate
) -> FurnitureQuotation:
    quotation = _load_quotation(db, quotation_id)
    _ensure_editable(quotation)

    subtotal, section_rows = _build_sections(body.sections)
    grand_total = _compute_grand_total(subtotal, body.discount, body.tax)

    quotation.customer_name = body.customer_name.strip()
    quotation.customer_address = body.customer_address.strip() if body.customer_address else None
    quotation.customer_phone = body.customer_phone.strip()
    quotation.date_issued = body.date_issued
    quotation.subtotal = subtotal
    quotation.discount = _money(body.discount)
    quotation.tax = _money(body.tax)
    quotation.grand_total = grand_total

    if quotation.status == FurnitureQuotationStatus.FINALIZED:
        quotation.status = FurnitureQuotationStatus.DRAFT

    quotation.is_autosave_session = False

    quotation.sections.clear()
    for section in section_rows:
        for item in section.items:
            item.quotation = quotation
        quotation.sections.append(section)

    db.add(quotation)
    db.flush()
    return _load_quotation(db, quotation.id)


def get_active_autosave_draft(
    db: Session, *, user_id: uuid.UUID
) -> FurnitureQuotation | None:
    return (
        db.query(FurnitureQuotation)
        .options(
            joinedload(FurnitureQuotation.sections).joinedload(FurnitureQuotationSection.items),
            joinedload(FurnitureQuotation.items),
        )
        .filter(
            FurnitureQuotation.created_by_user_id == user_id,
            FurnitureQuotation.is_autosave_session.is_(True),
            FurnitureQuotation.status == FurnitureQuotationStatus.DRAFT,
        )
        .order_by(FurnitureQuotation.updated_at.desc())
        .first()
    )


def discard_active_autosave_draft(db: Session, *, user_id: uuid.UUID) -> bool:
    draft = get_active_autosave_draft(db, user_id=user_id)
    if draft is None:
        return False
    db.delete(draft)
    db.flush()
    return True


def autosave_quotation(
    db: Session,
    body: FurnitureQuotationAutosaveBody,
    *,
    user_id: uuid.UUID,
) -> FurnitureQuotation:
    subtotal, section_rows = _build_sections_autosave(body.sections)
    discount = _money(body.discount)
    tax = _money(body.tax)
    if discount > subtotal:
        discount = subtotal
    grand_total = _money(subtotal - discount + tax)

    customer_name = body.customer_name.strip() or AUTOSAVE_CUSTOMER_NAME
    customer_phone = body.customer_phone.strip() or AUTOSAVE_CUSTOMER_PHONE
    customer_address = body.customer_address.strip() if body.customer_address else None

    quotation: FurnitureQuotation | None = None
    if body.quotation_id:
        try:
            quotation_id = uuid.UUID(body.quotation_id)
        except ValueError as exc:
            raise ValidationAppError("Invalid quotation id.", code="INVALID_QUOTATION_ID") from exc
        quotation = _load_quotation(db, quotation_id)
        _ensure_editable(quotation)
    else:
        quotation = get_active_autosave_draft(db, user_id=user_id)

    if quotation is None:
        year, index = allocate_quotation_sequence(db)
        quotation_number = _format_quotation_number(year, index)
        quotation = FurnitureQuotation(
            quotation_number=quotation_number,
            sequence_year=year,
            sequence_index=index,
            customer_name=customer_name,
            customer_address=customer_address,
            customer_phone=customer_phone,
            date_issued=body.date_issued,
            status=FurnitureQuotationStatus.DRAFT,
            is_autosave_session=not body.promote,
            subtotal=subtotal,
            discount=discount,
            tax=tax,
            grand_total=grand_total,
            created_by_user_id=user_id,
        )
        for section in section_rows:
            for item in section.items:
                item.quotation = quotation
            quotation.sections.append(section)
        db.add(quotation)
    else:
        quotation.customer_name = customer_name
        quotation.customer_address = customer_address
        quotation.customer_phone = customer_phone
        quotation.date_issued = body.date_issued
        quotation.subtotal = subtotal
        quotation.discount = discount
        quotation.tax = tax
        quotation.grand_total = grand_total
        if body.promote:
            quotation.is_autosave_session = False
        elif quotation.is_autosave_session:
            quotation.is_autosave_session = True
        quotation.sections.clear()
        for section in section_rows:
            for item in section.items:
                item.quotation = quotation
            quotation.sections.append(section)
        db.add(quotation)

    db.flush()
    return _load_quotation(db, quotation.id)


def finalize_quotation(db: Session, quotation_id: uuid.UUID) -> FurnitureQuotation:
    quotation = _load_quotation(db, quotation_id)
    if quotation.status == FurnitureQuotationStatus.CONVERTED:
        raise ValidationAppError(
            "Converted quotations cannot be finalized.", code="QUOTATION_CONVERTED"
        )
    if quotation.status == FurnitureQuotationStatus.FINALIZED:
        return quotation
    if quotation.is_autosave_session:
        raise ValidationAppError(
            "Save the quotation before finalizing.", code="QUOTATION_AUTOSAVE_SESSION"
        )
    if not quotation.items:
        raise ValidationAppError(
            "Quotation must have at least one priced item.", code="QUOTATION_EMPTY"
        )
    quotation.status = FurnitureQuotationStatus.FINALIZED
    db.add(quotation)
    db.flush()
    return _load_quotation(db, quotation.id)


def _allocate_order_sequence(db: Session) -> tuple[int, int]:
    calendar_year = datetime.now(UTC).year
    counter = db.get(FurnitureOrderSequenceCounter, calendar_year)
    if counter is None:
        counter = FurnitureOrderSequenceCounter(calendar_year=calendar_year, next_index=1)
        db.add(counter)
        db.flush()
    index = counter.next_index
    counter.next_index = index + 1
    db.add(counter)
    return calendar_year, index


def convert_quotation_to_order(
    db: Session, quotation_id: uuid.UUID, body: FurnitureQuotationConvertBody
) -> tuple[FurnitureQuotation, FurnitureOrder]:
    quotation = _load_quotation(db, quotation_id)
    if quotation.status == FurnitureQuotationStatus.CONVERTED:
        raise ValidationAppError(
            "Quotation has already been converted to an order.", code="QUOTATION_ALREADY_CONVERTED"
        )
    if quotation.status != FurnitureQuotationStatus.FINALIZED:
        raise ValidationAppError(
            "Only finalized quotations can be converted to orders.",
            code="QUOTATION_NOT_FINALIZED",
        )

    due_date = body.due_date or (quotation.date_issued + timedelta(days=30))

    year, index = _allocate_order_sequence(db)
    order_number = f"FUR-{year}-{index:03d}"

    order_items = [
        FurnitureOrderItem(
            sort_order=idx,
            name=item.name,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_total=item.line_total,
        )
        for idx, item in enumerate(quotation.items)
    ]

    order = FurnitureOrder(
        order_number=order_number,
        sequence_year=year,
        sequence_index=index,
        customer_name=quotation.customer_name,
        customer_address=quotation.customer_address,
        customer_phone=quotation.customer_phone,
        due_date=due_date,
        status=FurnitureOrderStatus.PENDING,
        subtotal=quotation.subtotal,
        grand_total=quotation.grand_total,
        source_quotation_id=quotation.id,
        source_quotation_number=quotation.quotation_number,
        items=order_items,
    )
    db.add(order)
    db.flush()

    quotation.status = FurnitureQuotationStatus.CONVERTED
    quotation.converted_order_id = order.id
    db.add(quotation)
    db.flush()

    return _load_quotation(db, quotation.id), order
