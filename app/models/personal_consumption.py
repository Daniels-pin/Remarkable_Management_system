"""Inventory withdrawals for personal use — not sales, advances, or expenses."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import PersonalConsumptionStatus
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.inventory import InventoryProduct
    from app.models.user import User


class PersonalConsumption(Base, TimestampMixin):
    __tablename__ = "personal_consumptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[PersonalConsumptionStatus] = mapped_column(
        Enum(PersonalConsumptionStatus, native_enum=False, length=16),
        default=PersonalConsumptionStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    unit_selling_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_cost_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_selling_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    consumed_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    recorded_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )
    financial_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_months.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    reason: Mapped[str] = mapped_column(String(256), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    business_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    inventory_restored: Mapped[bool] = mapped_column(default=False, nullable=False)
    voided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(nullable=True)

    product: Mapped[InventoryProduct] = relationship("InventoryProduct")
    consumed_by: Mapped[User] = relationship("User", foreign_keys=[consumed_by_user_id])
    recorded_by: Mapped[User] = relationship("User", foreign_keys=[recorded_by_user_id])
