"""Add autosave session flag to furniture quotations.

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-05-25

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "p6q7r8s9t0u1"
down_revision = "o5p6q7r8s9t0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "furniture_quotations",
        sa.Column(
            "is_autosave_session",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        "ix_furniture_quotations_autosave_session",
        "furniture_quotations",
        ["created_by_user_id", "is_autosave_session"],
    )
    op.alter_column("furniture_quotations", "is_autosave_session", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_furniture_quotations_autosave_session", table_name="furniture_quotations")
    op.drop_column("furniture_quotations", "is_autosave_session")
