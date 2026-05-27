"""Add quotation section subheadings for grouped item layout.

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-05-25

"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "o5p6q7r8s9t0"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "furniture_quotation_sections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("quotation_id", sa.UUID(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.ForeignKeyConstraint(["quotation_id"], ["furniture_quotations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_furniture_quotation_sections_quotation_id",
        "furniture_quotation_sections",
        ["quotation_id"],
    )

    op.add_column(
        "furniture_quotation_items",
        sa.Column("section_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_furniture_quotation_items_section_id",
        "furniture_quotation_items",
        "furniture_quotation_sections",
        ["section_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_furniture_quotation_items_section_id",
        "furniture_quotation_items",
        ["section_id"],
    )

    connection = op.get_bind()
    quotations = connection.execute(
        sa.text("SELECT id FROM furniture_quotations ORDER BY created_at")
    ).fetchall()

    for (quotation_id,) in quotations:
        section_id = uuid.uuid4()
        connection.execute(
            sa.text(
                """
                INSERT INTO furniture_quotation_sections (id, quotation_id, sort_order, title)
                VALUES (:section_id, :quotation_id, 0, :title)
                """
            ),
            {"section_id": section_id, "quotation_id": quotation_id, "title": "Items"},
        )
        connection.execute(
            sa.text(
                """
                UPDATE furniture_quotation_items
                SET section_id = :section_id
                WHERE quotation_id = :quotation_id
                """
            ),
            {"section_id": section_id, "quotation_id": quotation_id},
        )


def downgrade() -> None:
    op.drop_index("ix_furniture_quotation_items_section_id", table_name="furniture_quotation_items")
    op.drop_constraint(
        "fk_furniture_quotation_items_section_id",
        "furniture_quotation_items",
        type_="foreignkey",
    )
    op.drop_column("furniture_quotation_items", "section_id")

    op.drop_index(
        "ix_furniture_quotation_sections_quotation_id",
        table_name="furniture_quotation_sections",
    )
    op.drop_table("furniture_quotation_sections")
