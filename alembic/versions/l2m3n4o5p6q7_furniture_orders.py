"""Furniture orders management tables.

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-05-24

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "l2m3n4o5p6q7"
down_revision = "k1l2m3n4o5p6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "furniture_order_sequence_counters",
        sa.Column("calendar_year", sa.Integer(), nullable=False),
        sa.Column("next_index", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("calendar_year"),
    )
    op.create_table(
        "furniture_orders",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("order_number", sa.String(length=32), nullable=False),
        sa.Column("sequence_year", sa.Integer(), nullable=False),
        sa.Column("sequence_index", sa.Integer(), nullable=False),
        sa.Column("customer_name", sa.String(length=200), nullable=False),
        sa.Column("customer_address", sa.Text(), nullable=True),
        sa.Column("customer_phone", sa.String(length=40), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("subtotal", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("grand_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_number"),
        sa.UniqueConstraint("sequence_year", "sequence_index", name="uq_furniture_order_year_index"),
    )
    op.create_index("ix_furniture_orders_order_number", "furniture_orders", ["order_number"])
    op.create_index("ix_furniture_orders_due_date", "furniture_orders", ["due_date"])
    op.create_index("ix_furniture_orders_status", "furniture_orders", ["status"])

    op.create_table(
        "furniture_order_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("line_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["furniture_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_furniture_order_items_order_id", "furniture_order_items", ["order_id"])

    op.create_table(
        "furniture_order_payments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["order_id"], ["furniture_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_furniture_order_payments_order_id", "furniture_order_payments", ["order_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_furniture_order_payments_order_id", table_name="furniture_order_payments")
    op.drop_table("furniture_order_payments")
    op.drop_index("ix_furniture_order_items_order_id", table_name="furniture_order_items")
    op.drop_table("furniture_order_items")
    op.drop_index("ix_furniture_orders_status", table_name="furniture_orders")
    op.drop_index("ix_furniture_orders_due_date", table_name="furniture_orders")
    op.drop_index("ix_furniture_orders_order_number", table_name="furniture_orders")
    op.drop_table("furniture_orders")
    op.drop_table("furniture_order_sequence_counters")
