from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import BarberDailySummaryStatus
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.reconciliation_timeline import ReconciliationTimelineEvent


class BarberDailySummary(Base, TimestampMixin):
    """Manager-approved daily rollup for one barber; drives barber review / dispute / admin."""

    __tablename__ = "barber_daily_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    barber_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    financial_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_months.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    business_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    status: Mapped[BarberDailySummaryStatus] = mapped_column(
        Enum(BarberDailySummaryStatus, native_enum=False, length=32),
        default=BarberDailySummaryStatus.OPEN,
        nullable=False,
        index=True,
    )

    manager_proposal_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    total_original_barber: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    total_manager_approved: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )

    used_manager_entries_due_to_missing_barber: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    barber_rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    settled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    admin_resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    admin_resolved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    admin_resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_final_day_total: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    last_manager_action_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_manager_action_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    timeline_events: Mapped[list[ReconciliationTimelineEvent]] = relationship(
        "ReconciliationTimelineEvent",
        back_populates="summary",
        cascade="all, delete-orphan",
        order_by="ReconciliationTimelineEvent.created_at",
    )
