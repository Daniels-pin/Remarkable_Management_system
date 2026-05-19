"""Per-employee attendance start date.

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-05-19

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "j0k1l2m3n4o5"
down_revision = "i9j0k1l2m3n4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_profiles",
        sa.Column("attendance_start_date", sa.Date(), nullable=True),
    )

    # Active ops roles: tracking begins today; remove false pre-activation deductions.
    op.execute(
        sa.text(
            """
            UPDATE user_profiles up
            SET attendance_start_date = CURRENT_DATE
            FROM users u
            WHERE u.id = up.user_id
              AND u.role IN ('BARBER', 'STAFF', 'MANAGER')
              AND u.account_status = 'active'
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
    op.drop_column("user_profiles", "attendance_start_date")
