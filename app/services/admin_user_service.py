from __future__ import annotations

import secrets
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth.password import hash_password
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.models.enums import AccountStatus, SalaryType, UserRole
from app.models.user import User, UserProfile, UserSession
from app.schemas.admin_users import (
    AdminUserCreate,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserProfileBrief,
    AdminUserUpdate,
)


def _normalize_email(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    if "@" not in s:
        raise ValidationAppError("Email must contain @.", code="BAD_EMAIL")
    return s.lower()


def _default_salary_type(role: UserRole) -> SalaryType | None:
    if role == UserRole.BARBER:
        return SalaryType.COMMISSION
    if role in (UserRole.MANAGER, UserRole.ADMIN):
        return SalaryType.FIXED
    return SalaryType.FIXED


def _internal_email_for_username(db: Session, username: str) -> str:
    base = f"{username.strip().lower()}@users.remarkable.internal"
    if db.query(User.id).filter(User.email == base).first() is None:
        return base
    suffix = secrets.token_hex(3)
    candidate = f"{username.strip().lower()}.{suffix}@users.remarkable.internal"
    if db.query(User.id).filter(User.email == candidate).first() is None:
        return candidate
    raise ConflictError("Could not allocate a unique internal email.", code="EMAIL_ALLOCATION")


def _last_activity_map(db: Session) -> dict[uuid.UUID, datetime]:
    rows = (
        db.query(UserSession.user_id, func.max(UserSession.last_activity_at))
        .group_by(UserSession.user_id)
        .all()
    )
    return {uid: ts for uid, ts in rows}


def _user_to_list_item(user: User, last_active_at: datetime | None) -> AdminUserListItem:
    prof = user.profile
    return AdminUserListItem(
        id=user.id,
        email=user.email,
        username=user.username,
        role=user.role,
        account_status=user.account_status,
        salary_type=user.salary_type,
        commission_pct=user.commission_pct,
        fixed_salary=user.fixed_salary,
        avatar_seed=user.avatar_seed,
        must_change_password=user.must_change_password,
        profile=AdminUserProfileBrief(full_name=prof.full_name) if prof else None,
        last_active_at=last_active_at,
        created_at=user.created_at,
    )


def list_users_admin(db: Session) -> list[AdminUserListItem]:
    last_map = _last_activity_map(db)
    users = (
        db.query(User)
        .options(joinedload(User.profile))
        .order_by(User.created_at.desc(), User.username)
        .all()
    )
    return [_user_to_list_item(u, last_map.get(u.id)) for u in users]


def get_user_admin(db: Session, user_id: uuid.UUID) -> AdminUserDetail:
    user = db.query(User).options(joinedload(User.profile)).filter(User.id == user_id).one_or_none()
    if user is None:
        raise NotFoundError("User not found.", code="USER_NOT_FOUND")
    last_map = _last_activity_map(db)
    base = _user_to_list_item(user, last_map.get(user.id))
    return AdminUserDetail(**base.model_dump(), updated_at=user.updated_at)


def _ensure_profile(db: Session, user: User) -> UserProfile:
    if user.profile is None:
        p = UserProfile(user_id=user.id)
        db.add(p)
        db.flush()
        user.profile = p
    return user.profile


def _validate_compensation(
    *,
    role: UserRole,
    salary_type: SalaryType | None,
    commission_pct: Decimal | None,
    fixed_salary: Decimal | None,
) -> None:
    if role == UserRole.BARBER and salary_type == SalaryType.COMMISSION:
        if commission_pct is None:
            raise ValidationAppError(
                "Commission percentage is required for barbers on commission.",
                code="COMMISSION_REQUIRED",
            )
    if fixed_salary is not None and salary_type not in (
        SalaryType.FIXED,
        SalaryType.FIXED_OR_COMMISSION,
        None,
    ):
        if salary_type == SalaryType.COMMISSION and fixed_salary is not None:
            raise ValidationAppError(
                "Fixed salary is only used with fixed or hybrid salary types.",
                code="FIXED_SALARY_MISMATCH",
            )


def create_user_admin(
    db: Session,
    *,
    body: AdminUserCreate,
    admin_id: uuid.UUID,
) -> AdminUserDetail:
    username = body.username.strip()
    if db.query(User.id).filter(User.username == username).first():
        raise ConflictError("Username already in use.", code="USERNAME_TAKEN")

    email = _normalize_email(body.email) or _internal_email_for_username(db, username)
    if db.query(User.id).filter(User.email == email).first():
        raise ConflictError("Email already in use.", code="EMAIL_TAKEN")

    salary_type = body.salary_type or _default_salary_type(body.role)
    commission_pct = body.commission_pct
    fixed_salary = body.fixed_salary

    if body.role != UserRole.BARBER:
        commission_pct = None
    _validate_compensation(
        role=body.role,
        salary_type=salary_type,
        commission_pct=commission_pct,
        fixed_salary=fixed_salary,
    )

    user = User(
        email=email,
        username=username,
        password_hash=hash_password(body.temporary_password),
        must_change_password=True,
        role=body.role,
        account_status=body.account_status,
        salary_type=salary_type,
        commission_pct=commission_pct,
        fixed_salary=fixed_salary,
        avatar_seed=secrets.token_hex(8),
        created_by_admin_id=admin_id,
    )
    db.add(user)
    db.flush()
    profile = _ensure_profile(db, user)
    profile.full_name = body.full_name.strip()
    db.add(profile)
    db.flush()
    return get_user_admin(db, user.id)


def update_user_admin(
    db: Session,
    *,
    user_id: uuid.UUID,
    body: AdminUserUpdate,
    actor_user_id: uuid.UUID,
) -> AdminUserDetail:
    user = db.query(User).options(joinedload(User.profile)).filter(User.id == user_id).one_or_none()
    if user is None:
        raise NotFoundError("User not found.", code="USER_NOT_FOUND")
    if user.username.startswith("purged_"):
        raise ValidationAppError(
            "This account has been purged and cannot be edited.",
            code="USER_PURGED",
        )

    updates = body.model_dump(exclude_unset=True)
    if "full_name" in updates:
        profile = _ensure_profile(db, user)
        fn = updates["full_name"]
        profile.full_name = fn.strip() if isinstance(fn, str) and fn.strip() else None
        db.add(profile)

    if "email" in updates:
        em = _normalize_email(updates["email"])
        if em is not None and em != user.email:
            if db.query(User.id).filter(User.email == em, User.id != user.id).first():
                raise ConflictError("Email already in use.", code="EMAIL_TAKEN")
            user.email = em

    if "username" in updates:
        un = updates["username"].strip()
        if un != user.username and db.query(User.id).filter(User.username == un).first():
            raise ConflictError("Username already in use.", code="USERNAME_TAKEN")
        user.username = un

    if "role" in updates:
        new_role = updates["role"]
        if user.id == actor_user_id and new_role != UserRole.ADMIN:
            raise ForbiddenError(
                "You cannot remove your own admin role.",
                code="SELF_DEMOTE_FORBIDDEN",
            )
        user.role = new_role

    if "salary_type" in updates:
        user.salary_type = updates["salary_type"]
    if "commission_pct" in updates:
        user.commission_pct = updates["commission_pct"]
    if "fixed_salary" in updates:
        user.fixed_salary = updates["fixed_salary"]
    if "account_status" in updates:
        st = updates["account_status"]
        if user.id == actor_user_id and st != AccountStatus.ACTIVE:
            raise ForbiddenError(
                "You cannot change your own account status here.",
                code="SELF_STATUS_FORBIDDEN",
            )
        user.account_status = st

    if user.role != UserRole.BARBER:
        user.commission_pct = None

    _validate_compensation(
        role=user.role,
        salary_type=user.salary_type,
        commission_pct=user.commission_pct,
        fixed_salary=user.fixed_salary,
    )

    db.add(user)
    db.flush()
    return get_user_admin(db, user.id)


def set_account_status(
    db: Session,
    *,
    user_id: uuid.UUID,
    status: AccountStatus,
    actor_user_id: uuid.UUID,
) -> AdminUserDetail:
    if user_id == actor_user_id and status != AccountStatus.ACTIVE:
        raise ForbiddenError(
            "You cannot deactivate your own account.",
            code="SELF_DEACTIVATE_FORBIDDEN",
        )
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.", code="USER_NOT_FOUND")
    user.account_status = status
    db.add(user)
    if status != AccountStatus.ACTIVE:
        db.query(UserSession).filter(UserSession.user_id == user.id).delete(
            synchronize_session=False,
        )
    db.flush()
    return get_user_admin(db, user.id)


def admin_reset_password(
    db: Session,
    *,
    user_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> str:
    _ = actor_user_id
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.", code="USER_NOT_FOUND")
    temp = secrets.token_urlsafe(14)
    user.password_hash = hash_password(temp)
    user.must_change_password = True
    db.add(user)
    db.query(UserSession).filter(UserSession.user_id == user.id).delete(
        synchronize_session=False,
    )
    db.flush()
    return temp


def purge_user_record(
    db: Session,
    *,
    user_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> None:
    if user_id == actor_user_id:
        raise ForbiddenError("You cannot purge your own account.", code="SELF_PURGE_FORBIDDEN")
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.", code="USER_NOT_FOUND")
    if user.username.startswith("purged_"):
        raise ValidationAppError("This account has already been purged.", code="ALREADY_PURGED")
    if user.account_status not in (AccountStatus.DISABLED, AccountStatus.DELETED):
        raise ValidationAppError(
            "Only deactivated or deleted accounts can be purged.",
            code="PURGE_NOT_ELIGIBLE",
        )
    token = secrets.token_hex(6)
    user.email = f"purged_{user.id.hex[:12]}_{token}@purged.remarkable.internal"
    user.username = f"purged_{user.id.hex[:12]}_{token}"
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.must_change_password = True
    user.role = UserRole.STAFF
    user.account_status = AccountStatus.DELETED
    user.salary_type = None
    user.commission_pct = None
    user.fixed_salary = None
    user.avatar_seed = None
    if user.profile:
        user.profile.full_name = None
        user.profile.address = None
        user.profile.phone = None
        user.profile.bank_name = None
        user.profile.account_number = None
        user.profile.account_name = None
        db.add(user.profile)
    db.add(user)
    db.query(UserSession).filter(UserSession.user_id == user.id).delete(
        synchronize_session=False,
    )
    db.flush()
