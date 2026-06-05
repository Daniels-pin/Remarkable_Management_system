"""Attendance penalty waivers — preserve history, zero deductions, audit trail.

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-06-05

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r8s9t0u1v2w3"
down_revision: Union[str, Sequence[str], None] = "q7r8s9t0u1v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "attendance_records",
        sa.Column("original_deduction_amount", sa.Numeric(14, 2), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("waived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("waived_by_user_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("waiver_reason", sa.Text(), nullable=True),
    )
    op.create_foreign_key(
        "fk_attendance_records_waived_by_user_id",
        "attendance_records",
        "users",
        ["waived_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_attendance_records_waived_at",
        "attendance_records",
        ["waived_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_attendance_records_waived_at", table_name="attendance_records")
    op.drop_constraint(
        "fk_attendance_records_waived_by_user_id",
        "attendance_records",
        type_="foreignkey",
    )
    op.drop_column("attendance_records", "waiver_reason")
    op.drop_column("attendance_records", "waived_by_user_id")
    op.drop_column("attendance_records", "waived_at")
    op.drop_column("attendance_records", "original_deduction_amount")
