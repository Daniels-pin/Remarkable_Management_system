"""Furniture quotations and payment settings tables.

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-05-24

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "m3n4o5p6q7r8"
down_revision = "l2m3n4o5p6q7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "furniture_quotation_sequence_counters",
        sa.Column("calendar_year", sa.Integer(), nullable=False),
        sa.Column("next_index", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("calendar_year"),
    )

    op.create_table(
        "furniture_quotation_payment_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_name", sa.String(length=255), nullable=True),
        sa.Column("account_number", sa.String(length=64), nullable=True),
        sa.Column("bank_name", sa.String(length=128), nullable=True),
        sa.Column(
            "terms_text",
            sa.Text(),
            nullable=False,
            server_default="This document is a quotation for pricing and negotiation only.",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "furniture_quotations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("quotation_number", sa.String(length=32), nullable=False),
        sa.Column("sequence_year", sa.Integer(), nullable=False),
        sa.Column("sequence_index", sa.Integer(), nullable=False),
        sa.Column("customer_name", sa.String(length=200), nullable=False),
        sa.Column("customer_address", sa.Text(), nullable=True),
        sa.Column("customer_phone", sa.String(length=40), nullable=False),
        sa.Column("date_issued", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("subtotal", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("discount", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0"),
        sa.Column("tax", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0"),
        sa.Column("grand_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("converted_order_id", sa.UUID(), nullable=True),
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
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["converted_order_id"], ["furniture_orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("quotation_number"),
        sa.UniqueConstraint("sequence_year", "sequence_index", name="uq_furniture_quotation_year_index"),
    )
    op.create_index(
        "ix_furniture_quotations_quotation_number", "furniture_quotations", ["quotation_number"]
    )
    op.create_index("ix_furniture_quotations_date_issued", "furniture_quotations", ["date_issued"])
    op.create_index("ix_furniture_quotations_status", "furniture_quotations", ["status"])
    op.create_index(
        "ix_furniture_quotations_created_by_user_id",
        "furniture_quotations",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_furniture_quotations_converted_order_id",
        "furniture_quotations",
        ["converted_order_id"],
    )

    op.create_table(
        "furniture_quotation_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("quotation_id", sa.UUID(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("line_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["quotation_id"], ["furniture_quotations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_furniture_quotation_items_quotation_id", "furniture_quotation_items", ["quotation_id"]
    )

    op.add_column(
        "furniture_orders",
        sa.Column("source_quotation_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "furniture_orders",
        sa.Column("source_quotation_number", sa.String(length=32), nullable=True),
    )
    op.create_foreign_key(
        "fk_furniture_orders_source_quotation_id",
        "furniture_orders",
        "furniture_quotations",
        ["source_quotation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_furniture_orders_source_quotation_id",
        "furniture_orders",
        ["source_quotation_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_furniture_orders_source_quotation_id", table_name="furniture_orders")
    op.drop_constraint(
        "fk_furniture_orders_source_quotation_id", "furniture_orders", type_="foreignkey"
    )
    op.drop_column("furniture_orders", "source_quotation_number")
    op.drop_column("furniture_orders", "source_quotation_id")

    op.drop_index("ix_furniture_quotation_items_quotation_id", table_name="furniture_quotation_items")
    op.drop_table("furniture_quotation_items")

    op.drop_index("ix_furniture_quotations_converted_order_id", table_name="furniture_quotations")
    op.drop_index("ix_furniture_quotations_created_by_user_id", table_name="furniture_quotations")
    op.drop_index("ix_furniture_quotations_status", table_name="furniture_quotations")
    op.drop_index("ix_furniture_quotations_date_issued", table_name="furniture_quotations")
    op.drop_index("ix_furniture_quotations_quotation_number", table_name="furniture_quotations")
    op.drop_table("furniture_quotations")

    op.drop_table("furniture_quotation_payment_settings")
    op.drop_table("furniture_quotation_sequence_counters")
