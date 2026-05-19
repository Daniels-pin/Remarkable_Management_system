"""Ledger void workflow metadata.

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-05-19

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ledger_entries", sa.Column("void_reason", sa.Text(), nullable=True))
    op.add_column("ledger_entries", sa.Column("pending_void_reason", sa.Text(), nullable=True))
    op.add_column(
        "ledger_entries",
        sa.Column("pending_void_by_user_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "ledger_entries",
        sa.Column("pending_void_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_ledger_entries_pending_void_by_user_id",
        "ledger_entries",
        "users",
        ["pending_void_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_ledger_entries_pending_void_by_user_id",
        "ledger_entries",
        type_="foreignkey",
    )
    op.drop_column("ledger_entries", "pending_void_requested_at")
    op.drop_column("ledger_entries", "pending_void_by_user_id")
    op.drop_column("ledger_entries", "pending_void_reason")
    op.drop_column("ledger_entries", "void_reason")
