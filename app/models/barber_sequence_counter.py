from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class BarberSequenceCounter(Base):
    """Monotonic per-barber index source for reconciliation keys (#001, #002, …)."""

    __tablename__ = "barber_sequence_counters"

    barber_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    next_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
