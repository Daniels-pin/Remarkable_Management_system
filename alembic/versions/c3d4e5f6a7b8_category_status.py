"""sale and expense category status columns

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("sale_categories", "expense_categories"):
        op.add_column(table, sa.Column("status", sa.String(length=16), nullable=True))
        op.execute(
            f"UPDATE {table} SET status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END"
        )
        op.alter_column(table, "status", nullable=False)


def downgrade() -> None:
    op.drop_column("expense_categories", "status")
    op.drop_column("sale_categories", "status")
