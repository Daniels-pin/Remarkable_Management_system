from __future__ import annotations

import uuid

from sqlalchemy import Enum, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import LedgerRecordStream


class BarberSequenceCounter(Base):
    """Per-barber, per-month, per-stream index allocator (JUN26-001, JUN26-002, …)."""

    __tablename__ = "barber_sequence_counters"

    barber_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    financial_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_months.id", ondelete="CASCADE"),
        primary_key=True,
    )
    record_stream: Mapped[LedgerRecordStream] = mapped_column(
        Enum(LedgerRecordStream, native_enum=False, length=16),
        primary_key=True,
    )
    next_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
