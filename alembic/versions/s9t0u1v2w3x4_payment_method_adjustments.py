"""Ledger payment method correction audit trail (barbershop matched services).

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-06-13

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s9t0u1v2w3x4"
down_revision: Union[str, Sequence[str], None] = "r8s9t0u1v2w3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ledger_payment_method_adjustments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ledger_entry_id", sa.UUID(), nullable=False),
        sa.Column("original_method", sa.String(length=32), nullable=False),
        sa.Column("new_method", sa.String(length=32), nullable=False),
        sa.Column("corrected_by_user_id", sa.UUID(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["corrected_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["ledger_entry_id"],
            ["ledger_entries.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ledger_payment_method_adjustments_ledger_entry_id",
        "ledger_payment_method_adjustments",
        ["ledger_entry_id"],
    )
    op.create_index(
        "ix_ledger_payment_method_adjustments_created_at",
        "ledger_payment_method_adjustments",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ledger_payment_method_adjustments_created_at",
        table_name="ledger_payment_method_adjustments",
    )
    op.drop_index(
        "ix_ledger_payment_method_adjustments_ledger_entry_id",
        table_name="ledger_payment_method_adjustments",
    )
    op.drop_table("ledger_payment_method_adjustments")
