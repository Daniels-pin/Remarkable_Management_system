from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth.password import verify_password
from app.models.enums import AccountStatus
from app.models.user import User


def get_user_by_username_or_email(db: Session, username_or_email: str) -> User | None:
    key = username_or_email.strip()
    if not key:
        return None
    return db.query(User).filter(or_(User.username == key, User.email == key)).one_or_none()


def authenticate(db: Session, username_or_email: str, password: str) -> User | None:
    user = get_user_by_username_or_email(db, username_or_email)
    if user is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    if user.account_status != AccountStatus.ACTIVE:
        return None
    return user
