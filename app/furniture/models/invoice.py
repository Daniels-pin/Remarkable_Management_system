from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.furniture.models.enums import FurnitureInvoiceSource, FurnitureInvoiceStatus
from app.models.mixins import TimestampMixin


class FurnitureInvoiceSequenceCounter(Base):
    """Per-calendar-year invoice index allocator (INV-2026-0001). Never decrements."""

    __tablename__ = "furniture_invoice_sequence_counters"

    calendar_year: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class FurnitureInvoice(Base, TimestampMixin):
    __tablename__ = "furniture_invoices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    sequence_year: Mapped[int] = mapped_column(Integer, nullable=False)
    sequence_index: Mapped[int] = mapped_column(Integer, nullable=False)

    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sales_representative: Mapped[str | None] = mapped_column(String(200), nullable=True)

    date_issued: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    payment_terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    source: Mapped[FurnitureInvoiceSource] = mapped_column(
        Enum(FurnitureInvoiceSource, native_enum=False, length=32),
        nullable=False,
        default=FurnitureInvoiceSource.MANUAL,
    )
    source_quotation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture_quotations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_quotation_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_order_number: Mapped[str | None] = mapped_column(String(32), nullable=True)

    status: Mapped[FurnitureInvoiceStatus] = mapped_column(
        Enum(FurnitureInvoiceStatus, native_enum=False, length=32),
        nullable=False,
        default=FurnitureInvoiceStatus.DRAFT,
        index=True,
    )
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    additional_charges: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    tax: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list[FurnitureInvoiceItem]] = relationship(
        "FurnitureInvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="FurnitureInvoiceItem.sort_order",
    )
    payments: Mapped[list[FurnitureInvoicePayment]] = relationship(
        "FurnitureInvoicePayment",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="FurnitureInvoicePayment.payment_date",
    )
    status_history: Mapped[list[FurnitureInvoiceStatusHistory]] = relationship(
        "FurnitureInvoiceStatusHistory",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="FurnitureInvoiceStatusHistory.recorded_at",
    )

    __table_args__ = (
        UniqueConstraint("sequence_year", "sequence_index", name="uq_furniture_invoice_year_index"),
    )


class FurnitureInvoiceItem(Base):
    __tablename__ = "furniture_invoice_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    invoice: Mapped[FurnitureInvoice] = relationship("FurnitureInvoice", back_populates="items")


class FurnitureInvoicePayment(Base):
    __tablename__ = "furniture_invoice_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(64), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    description: Mapped[str] = mapped_column(String(128), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    invoice: Mapped[FurnitureInvoice] = relationship("FurnitureInvoice", back_populates="payments")


class FurnitureInvoiceStatusHistory(Base):
    __tablename__ = "furniture_invoice_status_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[FurnitureInvoiceStatus] = mapped_column(
        Enum(FurnitureInvoiceStatus, native_enum=False, length=32),
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    invoice: Mapped[FurnitureInvoice] = relationship(
        "FurnitureInvoice", back_populates="status_history"
    )
