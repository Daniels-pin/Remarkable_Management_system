"""Seed default sale and expense categories (loads `.env` via app settings).

Run from repo root:

    python scripts/seed_categories.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database.session import SessionLocal
from app.services.catalog_service import (
    seed_default_expense_categories,
    seed_default_sale_categories,
)


def main() -> int:
    db = SessionLocal()
    try:
        sale_created = seed_default_sale_categories(db)
        expense_created = seed_default_expense_categories(db)
        if sale_created or expense_created:
            print(
                f"Created {sale_created} sale categor{'y' if sale_created == 1 else 'ies'} "
                f"and {expense_created} expense categor{'y' if expense_created == 1 else 'ies'}."
            )
        else:
            print("Default categories already exist — nothing to seed.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
