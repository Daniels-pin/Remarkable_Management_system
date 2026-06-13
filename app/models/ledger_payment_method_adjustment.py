from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import PaymentMethod


class LedgerPaymentMethodAdjustment(Base):
    """Permanent audit trail when a matched service payment method is corrected."""

    __tablename__ = "ledger_payment_method_adjustments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ledger_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ledger_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    original_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, native_enum=False, length=32),
        nullable=False,
    )
    new_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, native_enum=False, length=32),
        nullable=False,
    )
    corrected_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
