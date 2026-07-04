"""Payroll advances — cash or product credit recovered via payroll deduction."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import TeamAdvanceStatus, TeamAdvanceType
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.inventory import InventoryProduct
    from app.models.user import User


class TeamAdvance(Base, TimestampMixin):
    __tablename__ = "team_advances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    advance_type: Mapped[TeamAdvanceType] = mapped_column(
        Enum(TeamAdvanceType, native_enum=False, length=16),
        nullable=False,
        index=True,
    )
    status: Mapped[TeamAdvanceStatus] = mapped_column(
        Enum(TeamAdvanceStatus, native_enum=False, length=16),
        default=TeamAdvanceStatus.OUTSTANDING,
        nullable=False,
        index=True,
    )
    employee_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    financial_month_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_months.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(256), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    business_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    recorded_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )

    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_products.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit_cost_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    unit_selling_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    inventory_restored: Mapped[bool] = mapped_column(default=False, nullable=False)

    settlement_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    settlement_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    settlement_financial_month_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_months.id", ondelete="SET NULL"),
        nullable=True,
    )
    voided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(nullable=True)

    employee: Mapped[User] = relationship("User", foreign_keys=[employee_user_id])
    product: Mapped[InventoryProduct | None] = relationship("InventoryProduct")
    recorded_by: Mapped[User] = relationship("User", foreign_keys=[recorded_by_user_id])
