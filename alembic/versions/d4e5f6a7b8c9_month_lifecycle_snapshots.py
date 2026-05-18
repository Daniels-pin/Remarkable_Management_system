"""Month lifecycle states, grace period, and financial snapshots."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "financial_months",
        sa.Column("grace_ends_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE financial_months SET state = 'grace_period' WHERE state = 'closed'"
        )
    )
    op.execute(
        sa.text(
            "UPDATE financial_months SET state = 'locked' WHERE state = 'paid_locked'"
        )
    )
    op.create_table(
        "financial_month_snapshots",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("financial_month_id", sa.UUID(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "captured_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["financial_month_id"],
            ["financial_months.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("financial_month_id"),
    )
    op.create_index(
        op.f("ix_financial_month_snapshots_financial_month_id"),
        "financial_month_snapshots",
        ["financial_month_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_financial_month_snapshots_financial_month_id"),
        table_name="financial_month_snapshots",
    )
    op.drop_table("financial_month_snapshots")
    op.drop_column("financial_months", "grace_ends_at")
    op.execute(
        sa.text(
            "UPDATE financial_months SET state = 'paid_locked' WHERE state = 'locked'"
        )
    )
    op.execute(
        sa.text(
            "UPDATE financial_months SET state = 'closed' WHERE state = 'grace_period'"
        )
    )
