"""Grace period correction audit trail.

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-07-04

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "x4y5z6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "w3x4y5z6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "grace_period_corrections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("financial_month_id", sa.UUID(), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("previous_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("performed_by_user_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["financial_month_id"], ["financial_months.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["performed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_grace_period_corrections_financial_month_id",
        "grace_period_corrections",
        ["financial_month_id"],
    )
    op.create_index(
        "ix_grace_period_corrections_action",
        "grace_period_corrections",
        ["action"],
    )
    op.create_index(
        "ix_grace_period_corrections_entity_id",
        "grace_period_corrections",
        ["entity_id"],
    )
    op.create_index(
        "ix_grace_period_corrections_created_at",
        "grace_period_corrections",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_grace_period_corrections_created_at", table_name="grace_period_corrections")
    op.drop_index("ix_grace_period_corrections_entity_id", table_name="grace_period_corrections")
    op.drop_index("ix_grace_period_corrections_action", table_name="grace_period_corrections")
    op.drop_index(
        "ix_grace_period_corrections_financial_month_id",
        table_name="grace_period_corrections",
    )
    op.drop_table("grace_period_corrections")
