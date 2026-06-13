"""Repair duplicate active manager ledger indexes and resync stream counters.

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-06-13

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
from sqlalchemy.orm import Session

revision: str = "u1v2w3x4y5z6"
down_revision: Union[str, Sequence[str], None] = "t0u1v2w3x4y5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    import app.main  # noqa: F401 — load full model graph before service imports

    from app.services import ledger_service

    # Use Alembic's connection so this migration shares the same transaction as
    # prior revisions in the batch (e.g. t0u1v2w3x4y5). SessionLocal() opens a
    # second connection and can deadlock on ledger_entries row locks.
    with Session(bind=op.get_bind()) as session:
        before = ledger_service.detect_manager_index_collisions(session)
        if before:
            ledger_service.repair_manager_index_collisions(session, dry_run=False)


def downgrade() -> None:
    # Data repair is not safely reversible.
    pass
