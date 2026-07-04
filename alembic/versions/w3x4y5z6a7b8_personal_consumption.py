"""Personal consumption — inventory withdrawals for admin/manager personal use.

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-07-04

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w3x4y5z6a7b8"
down_revision: Union[str, Sequence[str], None] = "v2w3x4y5z6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "personal_consumptions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_cost_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("unit_selling_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_cost_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_selling_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("consumed_by_user_id", sa.UUID(), nullable=False),
        sa.Column("recorded_by_user_id", sa.UUID(), nullable=False),
        sa.Column("financial_month_id", sa.UUID(), nullable=False),
        sa.Column("reason", sa.String(length=256), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("inventory_restored", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("voided_by_user_id", sa.UUID(), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["consumed_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["financial_month_id"], ["financial_months.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["product_id"], ["inventory_products.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["recorded_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["voided_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_personal_consumptions_status", "personal_consumptions", ["status"])
    op.create_index(
        "ix_personal_consumptions_product_id", "personal_consumptions", ["product_id"]
    )
    op.create_index(
        "ix_personal_consumptions_consumed_by_user_id",
        "personal_consumptions",
        ["consumed_by_user_id"],
    )
    op.create_index(
        "ix_personal_consumptions_financial_month_id",
        "personal_consumptions",
        ["financial_month_id"],
    )
    op.create_index(
        "ix_personal_consumptions_business_date", "personal_consumptions", ["business_date"]
    )


def downgrade() -> None:
    op.drop_table("personal_consumptions")
