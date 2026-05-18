"""Seed default barbershop service types (loads `.env` via app settings).

Run from repo root:

    python scripts/seed_service_types.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database.session import SessionLocal
from app.services.catalog_service import seed_default_service_types


def main() -> int:
    db = SessionLocal()
    try:
        created = seed_default_service_types(db)
        if created:
            print(f"Created {created} default service type(s).")
        else:
            print("Default service types already exist — nothing to seed.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
