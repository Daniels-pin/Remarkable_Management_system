from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.furniture.models.enums import FurnitureOrderStatus


class FurnitureOrderItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    quantity: int = Field(ge=1)
    unit_price: Decimal = Field(ge=0)


class FurnitureOrderCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    customer_address: str | None = None
    customer_phone: str = Field(min_length=1, max_length=40)
    due_date: date
    items: list[FurnitureOrderItemCreate] = Field(min_length=1)
    initial_deposit: Decimal = Field(default=Decimal("0"), ge=0)

    @field_validator("items")
    @classmethod
    def validate_items(cls, value: list[FurnitureOrderItemCreate]) -> list[FurnitureOrderItemCreate]:
        if not value:
            raise ValueError("At least one order item is required.")
        return value


class FurnitureOrderStatusUpdate(BaseModel):
    status: FurnitureOrderStatus


class FurnitureOrderDepositCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    note: str | None = None
