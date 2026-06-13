"""Validate manager counter sync after manual match (post-fix smoke test).

Run from repo root:

    python scripts/validate_index_collision_fix.py
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: F401

from app.database.session import SessionLocal
from app.models.barber_sequence_counter import BarberSequenceCounter
from app.models.catalog import ServiceType
from app.models.enums import LedgerRecordStream, PaymentMethod, UserRole
from app.models.user import User
from app.services import ledger_service


def main() -> int:
    db = SessionLocal()
    try:
        barbers = (
            db.query(User)
            .filter(User.role.in_([UserRole.BARBER, UserRole.STAFF]), User.account_status == "active")
            .all()
        )
        manager = db.query(User).filter(User.role == UserRole.MANAGER).first()
        st = db.query(ServiceType).filter(ServiceType.is_active.is_(True)).first()
        if not barbers or not manager or not st:
            print("SKIP: need barber, manager, and active service type.")
            return 0
        service_type_id = st.id

        for barber in barbers:
            occurred_at = datetime.now(UTC)
            employee_row = ledger_service.create_barber_service_entry(
                db,
                actor=barber,
                impersonator_id=None,
                ip_address=None,
                occurred_at=occurred_at,
                service_type_id=service_type_id,
                amount=Decimal("3500"),
                note="index-collision-fix validation",
            )
            emp_index = employee_row.barber_sequence_index
            fm_id = employee_row.financial_month_id
            assert emp_index is not None

            existing_mgr = ledger_service.find_manager_row_at_index(
                db,
                barber_user_id=barber.id,
                financial_month_id=fm_id,
                index=emp_index,
            )
            if existing_mgr is not None:
                continue

            counter_before = db.get(
                BarberSequenceCounter,
                (barber.id, fm_id, LedgerRecordStream.MANAGER),
            )
            next_before = counter_before.next_index if counter_before else 1

            ledger_service.match_pending_employee_entry(
                db,
                manager=manager,
                employee_entry_id=employee_row.id,
                payment_method=PaymentMethod.CASH,
            )

            counter_after_match = db.get(
                BarberSequenceCounter,
                (barber.id, fm_id, LedgerRecordStream.MANAGER),
            )
            next_after_match = counter_after_match.next_index if counter_after_match else None

            mgr_row = ledger_service.create_manager_official_service_line(
                db,
                manager=manager,
                impersonator_id=None,
                ip_address=None,
                barber_user_id=barber.id,
                occurred_at=occurred_at,
                service_type_id=service_type_id,
                amount=Decimal("5000"),
                payment_method=PaymentMethod.CASH,
                note="index-collision-fix validation manager-only",
            )

            db.rollback()

            if next_after_match is None or next_after_match < emp_index + 1:
                print(
                    "FAILED: counter did not advance after manual match "
                    f"(employee_index={emp_index}, counter_after={next_after_match})"
                )
                return 1
            if mgr_row.barber_sequence_index == emp_index:
                print(
                    "FAILED: new manager service reused matched index "
                    f"{emp_index}"
                )
                return 1

            print(
                f"OK ({barber.username}): match occupied index {emp_index}, "
                f"counter {next_before} -> {next_after_match}, "
                f"next manager service index {mgr_row.barber_sequence_index}."
            )
            return 0

        print("SKIP: could not find barber with a free manager index slot.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
