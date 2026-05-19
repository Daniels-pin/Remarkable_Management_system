"""Global sales/expense sequence counters.

Revision ID: g7h8i9j0k1l2
Revises: e6f7a8b9c0d1
Create Date: 2026-05-19

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "g7h8i9j0k1l2"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shop_ledger_sequence_counters",
        sa.Column("financial_month_id", sa.UUID(), nullable=False),
        sa.Column("entry_type", sa.String(length=32), nullable=False),
        sa.Column("next_index", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(
            ["financial_month_id"],
            ["financial_months.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("financial_month_id", "entry_type"),
    )

    # Backfill global indexes for existing sales and expenses (S-001, E-001, …).
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                financial_month_id,
                entry_type,
                ROW_NUMBER() OVER (
                    PARTITION BY financial_month_id, entry_type
                    ORDER BY occurred_at ASC, id ASC
                ) AS seq
            FROM ledger_entries
            WHERE entry_type IN ('sale', 'expense')
              AND record_lifecycle = 'active'
              AND barber_sequence_index IS NULL
        )
        UPDATE ledger_entries le
        SET barber_sequence_index = ranked.seq
        FROM ranked
        WHERE le.id = ranked.id
        """
    )
    op.execute(
        """
        INSERT INTO shop_ledger_sequence_counters (financial_month_id, entry_type, next_index)
        SELECT financial_month_id, entry_type, COALESCE(MAX(barber_sequence_index), 0) + 1
        FROM ledger_entries
        WHERE entry_type IN ('sale', 'expense')
          AND record_lifecycle = 'active'
          AND barber_sequence_index IS NOT NULL
        GROUP BY financial_month_id, entry_type
        ON CONFLICT (financial_month_id, entry_type) DO UPDATE
        SET next_index = GREATEST(
            shop_ledger_sequence_counters.next_index,
            EXCLUDED.next_index
        )
        """
    )


def downgrade() -> None:
    op.drop_table("shop_ledger_sequence_counters")
