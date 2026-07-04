from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field


class PersonalConsumptionCreate(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(gt=0)
    consumed_by_user_id: uuid.UUID
    reason: str = Field(min_length=1, max_length=256)
    notes: str | None = None
    business_date: date


class PersonalConsumptionVoidBody(BaseModel):
    void_reason: str = Field(min_length=1, max_length=512)
