from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import FinancialMonthState
from app.models.mixins import TimestampMixin


class FinancialMonth(Base, TimestampMixin):
    __tablename__ = "financial_months"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_financial_months_year_month"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[FinancialMonthState] = mapped_column(
        Enum(FinancialMonthState, native_enum=False, length=32),
        default=FinancialMonthState.OPEN,
        nullable=False,
        index=True,
    )

    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    grace_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_locked_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    reopen_events: Mapped[list[MonthReopenEvent]] = relationship(
        "MonthReopenEvent", back_populates="financial_month", cascade="all, delete-orphan"
    )
    snapshot: Mapped["FinancialMonthSnapshot | None"] = relationship(
        "FinancialMonthSnapshot",
        back_populates="financial_month",
        uselist=False,
        cascade="all, delete-orphan",
    )


class MonthReopenEvent(Base):
    __tablename__ = "month_reopen_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    financial_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_months.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    admin_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    financial_month: Mapped[FinancialMonth] = relationship(
        "FinancialMonth", back_populates="reopen_events"
    )
