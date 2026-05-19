from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import (
    LedgerEntryType,
    LedgerReconciliationStatus,
    LedgerRecordStream,
    PaymentMethod,
    RecordLifecycleState,
)
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.barber_daily_summary import BarberDailySummary


class LedgerEntry(Base, TimestampMixin):
    """Unified operational timeline: services, sales, expenses.

    Service rows carry a monotonic ``barber_sequence_index`` per employee, financial
    month, and ``record_stream`` (employee vs manager). Reconciliation compares both
    streams by index position — not by shared row identity.
    """

    __tablename__ = "ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    financial_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_months.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    entry_type: Mapped[LedgerEntryType] = mapped_column(
        Enum(LedgerEntryType, native_enum=False, length=32), nullable=False, index=True
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    business_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    service_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_types.id", ondelete="SET NULL"), nullable=True
    )
    sale_category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sale_categories.id", ondelete="SET NULL"), nullable=True
    )
    expense_category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True
    )

    employee_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    original_barber_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    manager_approved_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    barber_sequence_index: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    record_stream: Mapped[LedgerRecordStream | None] = mapped_column(
        Enum(LedgerRecordStream, native_enum=False, length=16),
        nullable=True,
        index=True,
    )

    reconciliation_status: Mapped[LedgerReconciliationStatus | None] = mapped_column(
        Enum(LedgerReconciliationStatus, native_enum=False, length=40),
        nullable=True,
        index=True,
    )

    record_lifecycle: Mapped[RecordLifecycleState] = mapped_column(
        Enum(RecordLifecycleState, native_enum=False, length=16),
        default=RecordLifecycleState.ACTIVE,
        nullable=False,
        index=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    purged_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    purge_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_manager_created_without_barber: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    barber_daily_summary_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("barber_daily_summaries.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, native_enum=False, length=32), nullable=True, index=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )

    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    barber_daily_summary: Mapped[BarberDailySummary | None] = relationship(
        "BarberDailySummary", foreign_keys=[barber_daily_summary_id]
    )
