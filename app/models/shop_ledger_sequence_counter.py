from __future__ import annotations

import uuid

from sqlalchemy import Enum, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import LedgerEntryType


class ShopLedgerSequenceCounter(Base):
    """Global per-month index allocator for sales (S-JUN26-001) and expenses (E-JUN26-001)."""

    __tablename__ = "shop_ledger_sequence_counters"

    financial_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_months.id", ondelete="CASCADE"),
        primary_key=True,
    )
    entry_type: Mapped[LedgerEntryType] = mapped_column(
        Enum(LedgerEntryType, native_enum=False, length=32),
        primary_key=True,
    )
    next_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
