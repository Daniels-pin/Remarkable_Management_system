"""Backfill and validate month-scoped ledger sequence indexes (barbershop).

Ensures every active service, sale, and expense row has a barber_sequence_index
within its financial month so month-aware display labels (e.g. JUN26-001) are
unambiguous. Reconciliation continues to pair on (employee_id, financial_month_id,
barber_sequence_index) — this migration does not alter those integers when already set.

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-06-13

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "t0u1v2w3x4y5"
down_revision: Union[str, Sequence[str], None] = "s9t0u1v2w3x4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Backfill missing service indexes per barber, financial month, and stream.
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY employee_user_id, financial_month_id, record_stream
                    ORDER BY occurred_at ASC, id ASC
                ) AS seq
            FROM ledger_entries
            WHERE entry_type = 'service'
              AND record_lifecycle = 'active'
              AND record_stream IS NOT NULL
              AND employee_user_id IS NOT NULL
              AND financial_month_id IS NOT NULL
              AND barber_sequence_index IS NULL
        )
        UPDATE ledger_entries le
        SET barber_sequence_index = ranked.seq
        FROM ranked
        WHERE le.id = ranked.id
        """
    )

    # Backfill missing sales/expense indexes per financial month and type.
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY financial_month_id, entry_type
                    ORDER BY occurred_at ASC, id ASC
                ) AS seq
            FROM ledger_entries
            WHERE entry_type IN ('sale', 'expense')
              AND record_lifecycle = 'active'
              AND financial_month_id IS NOT NULL
              AND barber_sequence_index IS NULL
        )
        UPDATE ledger_entries le
        SET barber_sequence_index = ranked.seq
        FROM ranked
        WHERE le.id = ranked.id
        """
    )

    # Reconcile barber stream counters with existing max indexes.
    op.execute(
        """
        INSERT INTO barber_sequence_counters (barber_user_id, financial_month_id, record_stream, next_index)
        SELECT
            employee_user_id,
            financial_month_id,
            record_stream,
            COALESCE(MAX(barber_sequence_index), 0) + 1
        FROM ledger_entries
        WHERE entry_type = 'service'
          AND record_stream IS NOT NULL
          AND barber_sequence_index IS NOT NULL
          AND employee_user_id IS NOT NULL
          AND financial_month_id IS NOT NULL
        GROUP BY employee_user_id, financial_month_id, record_stream
        ON CONFLICT (barber_user_id, financial_month_id, record_stream) DO UPDATE
        SET next_index = GREATEST(
            barber_sequence_counters.next_index,
            EXCLUDED.next_index
        )
        """
    )

    # Reconcile shop sales/expense counters with existing max indexes.
    op.execute(
        """
        INSERT INTO shop_ledger_sequence_counters (financial_month_id, entry_type, next_index)
        SELECT
            financial_month_id,
            entry_type,
            COALESCE(MAX(barber_sequence_index), 0) + 1
        FROM ledger_entries
        WHERE entry_type IN ('sale', 'expense')
          AND record_lifecycle = 'active'
          AND barber_sequence_index IS NOT NULL
          AND financial_month_id IS NOT NULL
        GROUP BY financial_month_id, entry_type
        ON CONFLICT (financial_month_id, entry_type) DO UPDATE
        SET next_index = GREATEST(
            shop_ledger_sequence_counters.next_index,
            EXCLUDED.next_index
        )
        """
    )


def downgrade() -> None:
    # Display labels are computed at runtime; no schema or stored label to revert.
    pass
