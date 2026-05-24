from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.furniture.models.enums import FurnitureOrderStatus
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    pass


class FurnitureOrderSequenceCounter(Base):
    """Per-calendar-year order index allocator (FUR-2026-001). Never decrements on delete."""

    __tablename__ = "furniture_order_sequence_counters"

    calendar_year: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class FurnitureOrder(Base, TimestampMixin):
    __tablename__ = "furniture_orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    sequence_year: Mapped[int] = mapped_column(Integer, nullable=False)
    sequence_index: Mapped[int] = mapped_column(Integer, nullable=False)

    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    status: Mapped[FurnitureOrderStatus] = mapped_column(
        Enum(FurnitureOrderStatus, native_enum=False, length=32),
        nullable=False,
        default=FurnitureOrderStatus.PENDING,
        index=True,
    )

    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    source_quotation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture_quotations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_quotation_number: Mapped[str | None] = mapped_column(String(32), nullable=True)

    items: Mapped[list[FurnitureOrderItem]] = relationship(
        "FurnitureOrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="FurnitureOrderItem.sort_order",
    )
    payments: Mapped[list[FurnitureOrderPayment]] = relationship(
        "FurnitureOrderPayment",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="FurnitureOrderPayment.recorded_at",
    )

    __table_args__ = (
        UniqueConstraint("sequence_year", "sequence_index", name="uq_furniture_order_year_index"),
    )


class FurnitureOrderItem(Base):
    __tablename__ = "furniture_order_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    order: Mapped[FurnitureOrder] = relationship("FurnitureOrder", back_populates="items")


class FurnitureOrderPayment(Base):
    """Customer deposits/payments — tracked separately from fixed order totals."""

    __tablename__ = "furniture_order_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    order: Mapped[FurnitureOrder] = relationship("FurnitureOrder", back_populates="payments")
