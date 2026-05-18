"""service type status column

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "service_types",
        sa.Column("status", sa.String(length=16), nullable=True),
    )
    op.execute(
        "UPDATE service_types SET status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END"
    )
    op.alter_column("service_types", "status", nullable=False)


def downgrade() -> None:
    op.drop_column("service_types", "status")
