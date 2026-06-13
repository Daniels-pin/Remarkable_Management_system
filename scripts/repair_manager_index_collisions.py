"""Detect and repair duplicate active manager ledger indexes.

Run from repo root:

    python scripts/repair_manager_index_collisions.py --report
    python scripts/repair_manager_index_collisions.py --repair
    python scripts/repair_manager_index_collisions.py --repair --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: F401 — ensure full app model graph is loaded

from app.database.session import SessionLocal
from app.services import ledger_service


def _print_report(reports: list[ledger_service.ManagerIndexCollisionReport]) -> None:
    if not reports:
        print("No duplicate active manager indexes found.")
        return

    print(f"Found {len(reports)} collision group(s):\n")
    for item in reports:
        month = (
            f"{item.financial_year}-{item.financial_month:02d}"
            if item.financial_year and item.financial_month
            else str(item.financial_month_id)
        )
        print(f"Employee: {item.employee_name or item.barber_user_id}")
        print(f"Month: {month}")
        print(f"Duplicate Index: {item.duplicate_index} ({item.index_label or 'n/a'})")
        print("Affected Records:")
        for record in item.affected_records:
            print(
                f"  - id={record['entry_id']} amount={record['amount']} "
                f"status={record['reconciliation_status']} created_at={record['created_at']}"
            )
        print()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", action="store_true", help="Print collision report only.")
    parser.add_argument("--repair", action="store_true", help="Repair collisions in the database.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="With --repair, show planned moves without committing.",
    )
    args = parser.parse_args()

    if not args.report and not args.repair:
        parser.error("Specify --report and/or --repair")

    db = SessionLocal()
    try:
        if args.report and not args.repair:
            reports = ledger_service.detect_manager_index_collisions(db)
            _print_report(reports)
            return 0

        before, actions = ledger_service.repair_manager_index_collisions(
            db,
            dry_run=args.dry_run,
        )
        _print_report(before)
        if actions:
            print("Repair actions:")
            print(json.dumps(actions, indent=2))
        else:
            print("No repair actions required.")

        if args.repair and not args.dry_run:
            db.commit()
            remaining = ledger_service.detect_manager_index_collisions(db)
            if remaining:
                print(f"WARNING: {len(remaining)} collision group(s) remain after repair.")
                return 1
            print("Repair committed successfully; no collisions remain.")
        elif args.dry_run:
            db.rollback()
            print("Dry run complete (no changes committed).")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
