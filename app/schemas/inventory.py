from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import PaymentMethod, ServiceTypeStatus


class InventoryCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    status: ServiceTypeStatus = ServiceTypeStatus.ACTIVE


class InventoryCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    status: ServiceTypeStatus | None = None


class InventoryProductCreate(BaseModel):
    category_id: UUID
    name: str = Field(min_length=1, max_length=128)
    cost_price: Decimal = Field(..., ge=0)
    default_selling_price: Decimal = Field(..., ge=0)
    opening_stock: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=0, ge=0)
    image_url: str | None = Field(default=None, max_length=512)
    status: ServiceTypeStatus = ServiceTypeStatus.ACTIVE


class InventoryProductUpdate(BaseModel):
    category_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=128)
    cost_price: Decimal | None = Field(default=None, ge=0)
    default_selling_price: Decimal | None = Field(default=None, ge=0)
    low_stock_threshold: int | None = Field(default=None, ge=0)
    image_url: str | None = Field(default=None, max_length=512)
    status: ServiceTypeStatus | None = None


class StockInBody(BaseModel):
    quantity: int = Field(..., gt=0)
    note: str | None = None


class StockAdjustBody(BaseModel):
    quantity_delta: int = Field(..., description="Signed adjustment; result must not go below zero.")
    note: str | None = None


class ProductSaleCreate(BaseModel):
    product_id: UUID
    quantity: int = Field(..., gt=0)
    unit_selling_price: Decimal | None = Field(
        default=None,
        ge=0,
        description="Custom negotiated price; defaults to product default selling price.",
    )
    sold_by_user_id: UUID
    payment_method: PaymentMethod
    occurred_at: datetime
    note: str | None = None
