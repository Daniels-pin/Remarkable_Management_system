from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class FurnitureQuotationItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    quantity: int = Field(ge=1)
    unit_price: Decimal = Field(ge=0)


class FurnitureQuotationSectionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    items: list[FurnitureQuotationItemCreate] = Field(default_factory=list)


class FurnitureQuotationCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    customer_address: str | None = None
    customer_phone: str = Field(min_length=1, max_length=40)
    date_issued: date
    sections: list[FurnitureQuotationSectionCreate] = Field(min_length=1)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    tax: Decimal = Field(default=Decimal("0"), ge=0)

    @field_validator("sections")
    @classmethod
    def validate_sections(
        cls, value: list[FurnitureQuotationSectionCreate]
    ) -> list[FurnitureQuotationSectionCreate]:
        if not value:
            raise ValueError("At least one quotation section is required.")
        priced_items = [item for section in value for item in section.items]
        if not priced_items:
            raise ValueError("At least one quotation item is required.")
        return value


class FurnitureQuotationUpdate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    customer_address: str | None = None
    customer_phone: str = Field(min_length=1, max_length=40)
    date_issued: date
    sections: list[FurnitureQuotationSectionCreate] = Field(min_length=1)
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


class FurnitureQuotationAutosaveItemCreate(BaseModel):
    name: str = Field(default="", max_length=200)
    description: str | None = None
    quantity: int = Field(default=0, ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)


class FurnitureQuotationAutosaveSectionCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    items: list[FurnitureQuotationAutosaveItemCreate] = Field(default_factory=list)


class FurnitureQuotationAutosaveBody(BaseModel):
    quotation_id: str | None = None
    customer_name: str = Field(default="", max_length=200)
    customer_address: str | None = None
    customer_phone: str = Field(default="", max_length=40)
    date_issued: date
    sections: list[FurnitureQuotationAutosaveSectionCreate] = Field(default_factory=list)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    tax: Decimal = Field(default=Decimal("0"), ge=0)
    promote: bool = False
