"""Dual independent index streams for reconciliation.

Revision ID: e6f7a8b9c0d1
Revises: d4e5f6a7b8c9
Create Date: 2026-05-19

"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "e6f7a8b9c0d1"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ledger_entries",
        sa.Column("record_stream", sa.String(length=16), nullable=True),
    )
    op.create_index(
        op.f("ix_ledger_entries_record_stream"),
        "ledger_entries",
        ["record_stream"],
        unique=False,
    )

    # Classify legacy rows into employee vs manager streams.
    op.execute(
        """
        UPDATE ledger_entries
        SET record_stream = 'manager'
        WHERE entry_type = 'service'
          AND (
            is_manager_created_without_barber = true
            OR reconciliation_status = 'missing_barber_entry'
          )
        """
    )
    op.execute(
        """
        UPDATE ledger_entries
        SET record_stream = 'employee'
        WHERE entry_type = 'service'
          AND record_stream IS NULL
        """
    )

    # Split legacy single-row reconciliations into independent manager stream rows.
    conn = op.get_bind()
    legacy = conn.execute(
        sa.text(
            """
            SELECT id, financial_month_id, employee_user_id, barber_sequence_index,
                   manager_approved_amount, service_type_id, occurred_at, business_date,
                   payment_method, note, reconciliation_status, barber_daily_summary_id,
                   created_by_user_id, locked_at, approved_at, approved_by_user_id
            FROM ledger_entries
            WHERE entry_type = 'service'
              AND record_stream = 'employee'
              AND manager_approved_amount IS NOT NULL
              AND barber_sequence_index IS NOT NULL
            """
        )
    ).fetchall()

    for row in legacy:
        mgr_id = uuid.uuid4()
        conn.execute(
            sa.text(
                """
                INSERT INTO ledger_entries (
                    id, financial_month_id, entry_type, occurred_at, business_date,
                    service_type_id, employee_user_id, amount, original_barber_amount,
                    manager_approved_amount, barber_sequence_index, record_stream,
                    reconciliation_status, record_lifecycle, payment_method, note,
                    created_by_user_id, is_manager_created_without_barber,
                    barber_daily_summary_id, locked_at, approved_at, approved_by_user_id
                ) VALUES (
                    :id, :financial_month_id, 'service', :occurred_at, :business_date,
                    :service_type_id, :employee_user_id, :amount, NULL,
                    NULL, :barber_sequence_index, 'manager',
                    :reconciliation_status, 'active', :payment_method, :note,
                    :created_by_user_id, false,
                    :barber_daily_summary_id, :locked_at, :approved_at, :approved_by_user_id
                )
                """
            ),
            {
                "id": mgr_id,
                "financial_month_id": row.financial_month_id,
                "occurred_at": row.occurred_at,
                "business_date": row.business_date,
                "service_type_id": row.service_type_id,
                "employee_user_id": row.employee_user_id,
                "amount": row.manager_approved_amount,
                "barber_sequence_index": row.barber_sequence_index,
                "reconciliation_status": row.reconciliation_status,
                "payment_method": row.payment_method,
                "note": row.note,
                "created_by_user_id": row.created_by_user_id,
                "barber_daily_summary_id": row.barber_daily_summary_id,
                "locked_at": row.locked_at,
                "approved_at": row.approved_at,
                "approved_by_user_id": row.approved_by_user_id,
            },
        )
        conn.execute(
            sa.text(
                """
                UPDATE ledger_entries
                SET manager_approved_amount = NULL,
                    amount = COALESCE(original_barber_amount, amount)
                WHERE id = :id
                """
            ),
            {"id": row.id},
        )

    op.execute("DROP INDEX IF EXISTS uq_ledger_barber_sequence")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_ledger_barber_sequence_stream
        ON ledger_entries (employee_user_id, financial_month_id, barber_sequence_index, record_stream)
        WHERE barber_sequence_index IS NOT NULL
          AND record_stream IS NOT NULL
          AND entry_type = 'service'
        """
    )

    # Rebuild sequence counters: per barber, month, stream.
    op.drop_table("barber_sequence_counters")
    op.create_table(
        "barber_sequence_counters",
        sa.Column("barber_user_id", sa.UUID(), nullable=False),
        sa.Column("financial_month_id", sa.UUID(), nullable=False),
        sa.Column("record_stream", sa.String(length=16), nullable=False),
        sa.Column("next_index", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["barber_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["financial_month_id"], ["financial_months.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("barber_user_id", "financial_month_id", "record_stream"),
    )

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
        GROUP BY employee_user_id, financial_month_id, record_stream
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_ledger_barber_sequence_stream")

    op.drop_table("barber_sequence_counters")
    op.create_table(
        "barber_sequence_counters",
        sa.Column("barber_user_id", sa.UUID(), nullable=False),
        sa.Column("next_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["barber_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("barber_user_id"),
    )

    op.execute(
        """
        CREATE UNIQUE INDEX uq_ledger_barber_sequence
        ON ledger_entries (employee_user_id, barber_sequence_index)
        WHERE barber_sequence_index IS NOT NULL
        """
    )

    op.drop_index(op.f("ix_ledger_entries_record_stream"), table_name="ledger_entries")
    op.drop_column("ledger_entries", "record_stream")
