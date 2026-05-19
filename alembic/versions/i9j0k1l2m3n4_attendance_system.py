"""Geolocation attendance system.

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-05-19

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "i9j0k1l2m3n4"
down_revision = "h8i9j0k1l2m3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attendance_settings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("latitude", sa.Numeric(10, 7), nullable=False),
        sa.Column("longitude", sa.Numeric(10, 7), nullable=False),
        sa.Column("location_label", sa.String(length=512), nullable=False),
        sa.Column("radius_meters", sa.Integer(), nullable=False),
        sa.Column("late_time", sa.Time(), nullable=False),
        sa.Column("late_deduction_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("absence_deduction_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("updated_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "attendance_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("signed_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sign_in_latitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("sign_in_longitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("deduction_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("deduction_reason", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "business_date", name="uq_attendance_user_date"),
    )
    op.create_index("ix_attendance_records_user_id", "attendance_records", ["user_id"])
    op.create_index("ix_attendance_records_business_date", "attendance_records", ["business_date"])

    op.add_column(
        "user_profiles",
        sa.Column("attendance_off_days", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    # Default shop location (Lagos) — admin can adjust via settings UI.
    op.execute(
        sa.text(
            """
            INSERT INTO attendance_settings (
                id, latitude, longitude, location_label, radius_meters,
                late_time, late_deduction_amount, absence_deduction_amount
            ) VALUES (
                gen_random_uuid(), 6.5244, 3.3792,
                'Remarkable Barbershop', 100,
                '09:00:00', 500.00, 2000.00
            )
            """
        )
    )


def downgrade() -> None:
    op.drop_column("user_profiles", "attendance_off_days")
    op.drop_index("ix_attendance_records_business_date", table_name="attendance_records")
    op.drop_index("ix_attendance_records_user_id", table_name="attendance_records")
    op.drop_table("attendance_records")
    op.drop_table("attendance_settings")
