from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import CommissionPayoutState
from app.models.mixins import TimestampMixin


class MonthlyCommissionStatement(Base, TimestampMixin):
    """Snapshot at month close; immutable after paid_locked unless admin reopens."""

    __tablename__ = "monthly_commission_statements"
    __table_args__ = (
        UniqueConstraint("financial_month_id", "user_id", name="uq_commission_month_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    financial_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_months.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    approved_service_revenue_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    commission_pct_at_close: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False)
    commission_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="finalized", nullable=False)

    payout_state: Mapped[CommissionPayoutState] = mapped_column(
        Enum(CommissionPayoutState, native_enum=False, length=16),
        default=CommissionPayoutState.UNPAID,
        nullable=False,
        index=True,
    )
    payout_marked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    payout_marked_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    payout_payment_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    payout_paid_by_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payout_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
