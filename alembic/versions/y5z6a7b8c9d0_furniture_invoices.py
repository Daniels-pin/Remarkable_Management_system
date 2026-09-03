"""Furniture invoices management tables.

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
Create Date: 2026-09-03

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "y5z6a7b8c9d0"
down_revision = "x4y5z6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "furniture_invoice_sequence_counters",
        sa.Column("calendar_year", sa.Integer(), nullable=False),
        sa.Column("next_index", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("calendar_year"),
    )
    op.create_table(
        "furniture_invoices",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_number", sa.String(length=32), nullable=False),
        sa.Column("sequence_year", sa.Integer(), nullable=False),
        sa.Column("sequence_index", sa.Integer(), nullable=False),
        sa.Column("customer_name", sa.String(length=200), nullable=False),
        sa.Column("customer_address", sa.Text(), nullable=True),
        sa.Column("customer_phone", sa.String(length=40), nullable=False),
        sa.Column("customer_email", sa.String(length=255), nullable=True),
        sa.Column("sales_representative", sa.String(length=200), nullable=True),
        sa.Column("date_issued", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("payment_terms", sa.Text(), nullable=True),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("source_quotation_id", sa.UUID(), nullable=True),
        sa.Column("source_quotation_number", sa.String(length=32), nullable=True),
        sa.Column("source_order_id", sa.UUID(), nullable=True),
        sa.Column("source_order_number", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("subtotal", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("discount", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0"),
        sa.Column(
            "additional_charges",
            sa.Numeric(precision=14, scale=2),
            nullable=False,
            server_default="0",
        ),
        sa.Column("tax", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0"),
        sa.Column("grand_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("invoice_number"),
        sa.UniqueConstraint("sequence_year", "sequence_index", name="uq_furniture_invoice_year_index"),
    )
    op.create_index("ix_furniture_invoices_invoice_number", "furniture_invoices", ["invoice_number"])
    op.create_index("ix_furniture_invoices_date_issued", "furniture_invoices", ["date_issued"])
    op.create_index("ix_furniture_invoices_due_date", "furniture_invoices", ["due_date"])
    op.create_index("ix_furniture_invoices_status", "furniture_invoices", ["status"])
    op.create_index(
        "ix_furniture_invoices_source_quotation_id", "furniture_invoices", ["source_quotation_id"]
    )
    op.create_index("ix_furniture_invoices_source_order_id", "furniture_invoices", ["source_order_id"])

    op.create_table(
        "furniture_invoice_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("line_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["invoice_id"], ["furniture_invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_furniture_invoice_items_invoice_id", "furniture_invoice_items", ["invoice_id"])

    op.create_table(
        "furniture_invoice_payments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("method", sa.String(length=64), nullable=False),
        sa.Column("reference", sa.String(length=128), nullable=True),
        sa.Column("description", sa.String(length=128), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["invoice_id"], ["furniture_invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_furniture_invoice_payments_invoice_id", "furniture_invoice_payments", ["invoice_id"]
    )

    op.create_table(
        "furniture_invoice_status_history",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["invoice_id"], ["furniture_invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_furniture_invoice_status_history_invoice_id",
        "furniture_invoice_status_history",
        ["invoice_id"],
    )

    op.create_foreign_key(
        "fk_furniture_invoices_source_quotation_id",
        "furniture_invoices",
        "furniture_quotations",
        ["source_quotation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_furniture_invoices_source_order_id",
        "furniture_invoices",
        "furniture_orders",
        ["source_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_furniture_invoices_created_by_user_id",
        "furniture_invoices",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "furniture_orders",
        sa.Column("converted_invoice_id", sa.UUID(), nullable=True),
    )
    op.create_index(
        "ix_furniture_orders_converted_invoice_id", "furniture_orders", ["converted_invoice_id"]
    )
    op.create_foreign_key(
        "fk_furniture_orders_converted_invoice_id",
        "furniture_orders",
        "furniture_invoices",
        ["converted_invoice_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "furniture_quotations",
        sa.Column("converted_invoice_id", sa.UUID(), nullable=True),
    )
    op.create_index(
        "ix_furniture_quotations_converted_invoice_id",
        "furniture_quotations",
        ["converted_invoice_id"],
    )
    op.create_foreign_key(
        "fk_furniture_quotations_converted_invoice_id",
        "furniture_quotations",
        "furniture_invoices",
        ["converted_invoice_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_furniture_quotations_converted_invoice_id", "furniture_quotations", type_="foreignkey"
    )
    op.drop_index("ix_furniture_quotations_converted_invoice_id", table_name="furniture_quotations")
    op.drop_column("furniture_quotations", "converted_invoice_id")

    op.drop_constraint("fk_furniture_orders_converted_invoice_id", "furniture_orders", type_="foreignkey")
    op.drop_index("ix_furniture_orders_converted_invoice_id", table_name="furniture_orders")
    op.drop_column("furniture_orders", "converted_invoice_id")

    op.drop_index(
        "ix_furniture_invoice_status_history_invoice_id",
        table_name="furniture_invoice_status_history",
    )
    op.drop_table("furniture_invoice_status_history")
    op.drop_index("ix_furniture_invoice_payments_invoice_id", table_name="furniture_invoice_payments")
    op.drop_table("furniture_invoice_payments")
    op.drop_index("ix_furniture_invoice_items_invoice_id", table_name="furniture_invoice_items")
    op.drop_table("furniture_invoice_items")
    op.drop_index("ix_furniture_invoices_source_order_id", table_name="furniture_invoices")
    op.drop_index("ix_furniture_invoices_source_quotation_id", table_name="furniture_invoices")
    op.drop_index("ix_furniture_invoices_status", table_name="furniture_invoices")
    op.drop_index("ix_furniture_invoices_due_date", table_name="furniture_invoices")
    op.drop_index("ix_furniture_invoices_date_issued", table_name="furniture_invoices")
    op.drop_index("ix_furniture_invoices_invoice_number", table_name="furniture_invoices")
    op.drop_table("furniture_invoices")
    op.drop_table("furniture_invoice_sequence_counters")
