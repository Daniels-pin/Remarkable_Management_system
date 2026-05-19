"""Backfill attendance_start_date for active ops roles (enum casing fix).

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-05-19

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "k1l2m3n4o5p6"
down_revision = "j0k1l2m3n4o5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Never formally activated: tracking begins today (matches original migration intent).
    op.execute(
        sa.text(
            """
            UPDATE user_profiles up
            SET attendance_start_date = CURRENT_DATE
            FROM users u
            WHERE u.id = up.user_id
              AND u.role IN ('BARBER', 'STAFF', 'MANAGER')
              AND u.account_status = 'ACTIVE'
              AND up.attendance_start_date IS NULL
            """
        )
    )

    op.execute(
        sa.text(
            """
            DELETE FROM attendance_records ar
            USING user_profiles up
            WHERE ar.user_id = up.user_id
              AND up.attendance_start_date IS NOT NULL
              AND ar.business_date < up.attendance_start_date
            """
        )
    )


def downgrade() -> None:
    pass
