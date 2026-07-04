"""Team advances — payroll deductions for cash and product credit.

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-07-04

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v2w3x4y5z6a7"
down_revision: Union[str, Sequence[str], None] = "u1v2w3x4y5z6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "team_advances",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("advance_type", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="outstanding"),
        sa.Column("employee_user_id", sa.UUID(), nullable=False),
        sa.Column("financial_month_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("reason", sa.String(length=256), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("recorded_by_user_id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("unit_cost_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("unit_selling_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("inventory_restored", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("settlement_year", sa.Integer(), nullable=True),
        sa.Column("settlement_month", sa.Integer(), nullable=True),
        sa.Column("settlement_financial_month_id", sa.UUID(), nullable=True),
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
        sa.ForeignKeyConstraint(["employee_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["financial_month_id"], ["financial_months.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["product_id"], ["inventory_products.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["recorded_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["settlement_financial_month_id"], ["financial_months.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["voided_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_team_advances_advance_type", "team_advances", ["advance_type"])
    op.create_index("ix_team_advances_status", "team_advances", ["status"])
    op.create_index("ix_team_advances_employee_user_id", "team_advances", ["employee_user_id"])
    op.create_index("ix_team_advances_financial_month_id", "team_advances", ["financial_month_id"])
    op.create_index("ix_team_advances_business_date", "team_advances", ["business_date"])
    op.create_index("ix_team_advances_product_id", "team_advances", ["product_id"])


def downgrade() -> None:
    op.drop_table("team_advances")
