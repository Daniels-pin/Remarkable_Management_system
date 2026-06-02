"""Barbershop retail inventory — isolated from furniture workflows."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.enums import InventoryStockMovementType, ServiceTypeStatus
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.ledger import LedgerEntry


class InventoryCategory(Base, TimestampMixin):
    __tablename__ = "inventory_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16),
        default=ServiceTypeStatus.ACTIVE,
        nullable=False,
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    products: Mapped[list[InventoryProduct]] = relationship(
        "InventoryProduct", back_populates="category"
    )

    @property
    def is_selectable(self) -> bool:
        return self.status == ServiceTypeStatus.ACTIVE


class InventoryProduct(Base, TimestampMixin):
    __tablename__ = "inventory_products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    default_selling_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16),
        default=ServiceTypeStatus.ACTIVE,
        nullable=False,
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    category: Mapped[InventoryCategory] = relationship("InventoryCategory", back_populates="products")
    stock_movements: Mapped[list[InventoryStockMovement]] = relationship(
        "InventoryStockMovement", back_populates="product"
    )
    sales: Mapped[list[InventoryProductSale]] = relationship(
        "InventoryProductSale", back_populates="product"
    )

    @property
    def is_selectable(self) -> bool:
        return self.status == ServiceTypeStatus.ACTIVE

    @property
    def is_low_stock(self) -> bool:
        if self.low_stock_threshold <= 0:
            return False
        return self.stock_quantity <= self.low_stock_threshold


class InventoryStockMovement(Base, TimestampMixin):
    __tablename__ = "inventory_stock_movements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    movement_type: Mapped[InventoryStockMovementType] = mapped_column(
        Enum(InventoryStockMovementType, native_enum=False, length=32),
        nullable=False,
        index=True,
    )
    quantity_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_before: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_after: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    reference_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )

    product: Mapped[InventoryProduct] = relationship("InventoryProduct", back_populates="stock_movements")


class InventoryProductSale(Base, TimestampMixin):
    """Immutable sale economics snapshot — never recalculated from future catalog prices."""

    __tablename__ = "inventory_product_sales"
    __table_args__ = (UniqueConstraint("ledger_entry_id", name="uq_inventory_product_sales_ledger"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ledger_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ledger_entries.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    unit_selling_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    revenue: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    profit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    sold_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )
    stock_restored: Mapped[bool] = mapped_column(default=False, nullable=False)

    product: Mapped[InventoryProduct] = relationship("InventoryProduct", back_populates="sales")
    ledger_entry: Mapped[LedgerEntry] = relationship("LedgerEntry", foreign_keys=[ledger_entry_id])
