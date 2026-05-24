"""Add company information fields to quotation document settings.

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-05-24

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "n4o5p6q7r8s9"
down_revision = "m3n4o5p6q7r8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "furniture_quotation_payment_settings",
        sa.Column("primary_phone", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "furniture_quotation_payment_settings",
        sa.Column("secondary_phone", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "furniture_quotation_payment_settings",
        sa.Column("instagram_handle", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "furniture_quotation_payment_settings",
        sa.Column("company_address", sa.Text(), nullable=True),
    )

    op.execute(
        """
        UPDATE furniture_quotation_payment_settings
        SET
            primary_phone = COALESCE(primary_phone, '+234 901 246 2061'),
            secondary_phone = COALESCE(secondary_phone, '+234 706 097 9362'),
            instagram_handle = COALESCE(instagram_handle, 'remarkable_furniture'),
            company_address = COALESCE(
                company_address,
                'Shinko Factory, Little Rayfield, Jos, Plateau State'
            )
        WHERE id = 1
        """
    )


def downgrade() -> None:
    op.drop_column("furniture_quotation_payment_settings", "company_address")
    op.drop_column("furniture_quotation_payment_settings", "instagram_handle")
    op.drop_column("furniture_quotation_payment_settings", "secondary_phone")
    op.drop_column("furniture_quotation_payment_settings", "primary_phone")
