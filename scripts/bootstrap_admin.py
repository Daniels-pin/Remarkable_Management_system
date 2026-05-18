"""Create or reset the bootstrap admin user (loads `.env` via app settings).

Run from repo root:

    python scripts/bootstrap_admin.py
"""

from __future__ import annotations

import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.orm import Session

from app.auth.password import hash_password
from app.database.session import SessionLocal
from app.models.enums import AccountStatus, SalaryType, UserRole
from app.models.user import User, UserProfile, UserSession

USERNAME = "uche@remarkable.com"
EMAIL = "uche@remarkable.com"
PASSWORD = "123456"


def main() -> int:
    db: Session = SessionLocal()
    try:
        existing = (
            db.query(User)
            .filter((User.username == USERNAME) | (User.email == EMAIL.lower()))
            .first()
        )
        if existing:
            db.query(UserSession).filter(UserSession.user_id == existing.id).delete()
            existing.email = EMAIL.lower()
            existing.username = USERNAME
            existing.password_hash = hash_password(PASSWORD)
            existing.must_change_password = False
            existing.role = UserRole.ADMIN
            existing.account_status = AccountStatus.ACTIVE
            existing.salary_type = SalaryType.FIXED
            if existing.profile is None:
                db.add(UserProfile(user_id=existing.id, full_name=None))
            db.commit()
            print(
                f"Reset admin: id={existing.id} username={existing.username!r} "
                f"email={existing.email!r}",
            )
            return 0

        user = User(
            email=EMAIL.lower(),
            username=USERNAME,
            password_hash=hash_password(PASSWORD),
            must_change_password=False,
            role=UserRole.ADMIN,
            account_status=AccountStatus.ACTIVE,
            salary_type=SalaryType.FIXED,
            commission_pct=None,
            fixed_salary=None,
            avatar_seed=secrets.token_hex(8),
            created_by_admin_id=None,
        )
        db.add(user)
        db.flush()
        db.add(UserProfile(user_id=user.id, full_name=None))
        db.commit()
        print(f"Created admin: id={user.id} username={USERNAME!r}")
        return 0
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        print(exc, file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
