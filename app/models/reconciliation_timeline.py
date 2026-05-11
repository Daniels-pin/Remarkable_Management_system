from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import ReconciliationTimelineEventType

if TYPE_CHECKING:
    from app.models.barber_daily_summary import BarberDailySummary


class ReconciliationTimelineEvent(Base):
    __tablename__ = "reconciliation_timeline_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    summary_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("barber_daily_summaries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[ReconciliationTimelineEventType] = mapped_column(
        Enum(ReconciliationTimelineEventType, native_enum=False, length=48),
        nullable=False,
        index=True,
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    summary: Mapped[BarberDailySummary] = relationship(
        "BarberDailySummary", back_populates="timeline_events"
    )
