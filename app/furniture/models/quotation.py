from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.furniture.models.enums import FurnitureQuotationStatus
from app.models.mixins import TimestampMixin


class FurnitureQuotationSequenceCounter(Base):
    """Per-calendar-year quotation index allocator (QUO-2026-001). Never decrements."""

    __tablename__ = "furniture_quotation_sequence_counters"

    calendar_year: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class FurnitureQuotationPaymentSettings(Base):
    """Global quotation document settings — payment, terms, and company information."""

    __tablename__ = "furniture_quotation_payment_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bank_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    terms_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="This document is a quotation for pricing and negotiation only.",
    )
    primary_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    secondary_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    instagram_handle: Mapped[str | None] = mapped_column(String(64), nullable=True)
    company_address: Mapped[str | None] = mapped_column(Text, nullable=True)


class FurnitureQuotation(Base, TimestampMixin):
    __tablename__ = "furniture_quotations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    quotation_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    sequence_year: Mapped[int] = mapped_column(Integer, nullable=False)
    sequence_index: Mapped[int] = mapped_column(Integer, nullable=False)

    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    date_issued: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    status: Mapped[FurnitureQuotationStatus] = mapped_column(
        Enum(FurnitureQuotationStatus, native_enum=False, length=32),
        nullable=False,
        default=FurnitureQuotationStatus.DRAFT,
        index=True,
    )

    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    tax: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    converted_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    items: Mapped[list[FurnitureQuotationItem]] = relationship(
        "FurnitureQuotationItem",
        back_populates="quotation",
        cascade="all, delete-orphan",
        order_by="FurnitureQuotationItem.sort_order",
    )

    __table_args__ = (
        UniqueConstraint(
            "sequence_year", "sequence_index", name="uq_furniture_quotation_year_index"
        ),
    )


class FurnitureQuotationItem(Base):
    __tablename__ = "furniture_quotation_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    quotation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture_quotations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    quotation: Mapped[FurnitureQuotation] = relationship(
        "FurnitureQuotation", back_populates="items"
    )
