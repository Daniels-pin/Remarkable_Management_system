from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class FurnitureQuotationItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    quantity: int = Field(ge=1)
    unit_price: Decimal = Field(ge=0)


class FurnitureQuotationCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    customer_address: str | None = None
    customer_phone: str = Field(min_length=1, max_length=40)
    date_issued: date
    items: list[FurnitureQuotationItemCreate] = Field(min_length=1)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    tax: Decimal = Field(default=Decimal("0"), ge=0)

    @field_validator("items")
    @classmethod
    def validate_items(
        cls, value: list[FurnitureQuotationItemCreate]
    ) -> list[FurnitureQuotationItemCreate]:
        if not value:
            raise ValueError("At least one quotation item is required.")
        return value


class FurnitureQuotationUpdate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    customer_address: str | None = None
    customer_phone: str = Field(min_length=1, max_length=40)
    date_issued: date
    items: list[FurnitureQuotationItemCreate] = Field(min_length=1)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    tax: Decimal = Field(default=Decimal("0"), ge=0)


class FurnitureQuotationPaymentSettingsUpdate(BaseModel):
    account_name: str | None = Field(None, max_length=255)
    account_number: str | None = Field(None, max_length=64)
    bank_name: str | None = Field(None, max_length=128)
    terms_text: str | None = None
    primary_phone: str | None = Field(None, max_length=40)
    secondary_phone: str | None = Field(None, max_length=40)
    instagram_handle: str | None = Field(None, max_length=64)
    company_address: str | None = None


class FurnitureQuotationConvertBody(BaseModel):
    due_date: date | None = None
