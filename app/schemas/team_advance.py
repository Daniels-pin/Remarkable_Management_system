from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TeamAdvanceCashCreate(BaseModel):
    employee_user_id: uuid.UUID
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=1, max_length=256)
    notes: str | None = None
    business_date: date


class TeamAdvanceProductCreate(BaseModel):
    employee_user_id: uuid.UUID
    product_id: uuid.UUID
    quantity: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=256)
    notes: str | None = None
    business_date: date
    unit_selling_price: Decimal | None = None


class TeamAdvanceVoidBody(BaseModel):
    void_reason: str = Field(min_length=1, max_length=512)
