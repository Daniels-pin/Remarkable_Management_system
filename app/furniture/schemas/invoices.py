from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.furniture.models.enums import (
    FurnitureInvoicePaymentScenario,
    FurnitureInvoiceStatus,
)


class FurnitureInvoiceItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    quantity: int = Field(ge=1)
    unit_price: Decimal = Field(ge=0)


class FurnitureInvoiceCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    customer_address: str | None = None
    customer_phone: str = Field(min_length=1, max_length=40)
    customer_email: str | None = None
    sales_representative: str | None = None
    date_issued: date
    due_date: date
    payment_terms: str | None = None
    internal_notes: str | None = None
    items: list[FurnitureInvoiceItemCreate] = Field(min_length=1)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    additional_charges: Decimal = Field(default=Decimal("0"), ge=0)
    tax: Decimal | None = Field(default=None, ge=0)
    advance_payment: Decimal = Field(default=Decimal("0"), ge=0)
    advance_payment_method: str | None = None
    advance_payment_reference: str | None = None
    advance_payment_date: date | None = None

    @field_validator("items")
    @classmethod
    def validate_items(
        cls, value: list[FurnitureInvoiceItemCreate]
    ) -> list[FurnitureInvoiceItemCreate]:
        if not value:
            raise ValueError("At least one invoice item is required.")
        return value


class FurnitureInvoiceUpdate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    customer_address: str | None = None
    customer_phone: str = Field(min_length=1, max_length=40)
    customer_email: str | None = None
    sales_representative: str | None = None
    date_issued: date
    due_date: date
    payment_terms: str | None = None
    internal_notes: str | None = None
    items: list[FurnitureInvoiceItemCreate] = Field(min_length=1)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    additional_charges: Decimal = Field(default=Decimal("0"), ge=0)
    tax: Decimal | None = Field(default=None, ge=0)


class FurnitureInvoiceNotesUpdate(BaseModel):
    internal_notes: str | None = None
    payment_terms: str | None = None


class FurnitureInvoicePaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    method: str = Field(min_length=1, max_length=64)
    reference: str | None = None
    payment_date: date
    notes: str | None = None


class FurnitureInvoiceConvertPayment(BaseModel):
    payment_scenario: FurnitureInvoicePaymentScenario
    payment_amount: Decimal | None = Field(default=None, ge=0)
    payment_method: str | None = None
    payment_date: date | None = None
    payment_reference: str | None = None
    due_date: date | None = None
    payment_terms: str | None = None
    sales_representative: str | None = None


class FurnitureInvoiceVoidBody(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class FurnitureInvoiceSendBody(BaseModel):
    pass


class FurnitureInvoiceListFilters(BaseModel):
    status: FurnitureInvoiceStatus | None = None
    customer: str | None = None
    sales_representative: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    search: str | None = None
    period: str | None = None  # today, week, month, year, all
