"""Geolocation attendance — sign-in, absences, deductions, and payroll hooks."""

from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from math import asin, cos, radians, sin, sqrt

from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.models.attendance import AttendanceRecord, AttendanceSettings
from app.models.enums import AccountStatus, AttendanceStatus, UserRole
from app.models.user import User
from app.services.business_time import business_date_for_instant, shop_tz

_ZERO = Decimal("0")
_EARTH_RADIUS_M = 6_371_000
_ATTENDANCE_ROLES = (UserRole.MANAGER, UserRole.BARBER, UserRole.STAFF)
_ATTENDANCE_ROLE_ORDER = case(
    (User.role == UserRole.MANAGER, 0),
    (User.role == UserRole.BARBER, 1),
    (User.role == UserRole.STAFF, 2),
    else_=3,
)
_SUNDAY = 6


def is_attendance_subject(user: User) -> bool:
    return user.role in _ATTENDANCE_ROLES and user.account_status == AccountStatus.ACTIVE


def attendance_start_date_for(user: User) -> date | None:
    if user.profile is None:
        return None
    return user.profile.attendance_start_date


def earliest_attendance_record_date(db: Session, *, user_id: uuid.UUID) -> date | None:
    return (
        db.query(func.min(AttendanceRecord.business_date))
        .filter(AttendanceRecord.user_id == user_id)
        .scalar()
    )


def resolve_attendance_start_date(
    db: Session,
    user: User,
    *,
    persist: bool = True,
) -> date | None:
    """
    Effective attendance activation date for payroll deductions.

    Uses the profile start date when set; otherwise infers from the earliest
    attendance record and optionally persists activation.
    """
    if not is_attendance_subject(user):
        return None

    start = attendance_start_date_for(user)
    if start is not None:
        return start

    inferred = earliest_attendance_record_date(db, user_id=user.id)
    if inferred is None:
        return None

    # Only infer activation from real sign-ins — not system-marked absences created
    # before formal activation when start date was missing.
    earliest_signed_in = (
        db.query(func.min(AttendanceRecord.business_date))
        .filter(
            AttendanceRecord.user_id == user.id,
            AttendanceRecord.signed_in_at.isnot(None),
        )
        .scalar()
    )
    if earliest_signed_in is None:
        return None

    if persist:
        activate_user_attendance(db, user=user, start_date=earliest_signed_in)
    return earliest_signed_in


def is_attendance_tracking_active(user: User, business_date: date) -> bool:
    """Attendance penalties apply only on/after the employee's activation date."""
    if not is_attendance_subject(user):
        return False
    start = attendance_start_date_for(user)
    if start is None:
        return False
    return business_date >= start


def _ensure_profile(db: Session, user: User):
    if user.profile is None:
        from app.models.user import UserProfile

        user.profile = UserProfile(user_id=user.id)
        db.add(user.profile)
        db.flush()


def activate_user_attendance(
    db: Session,
    *,
    user: User,
    start_date: date | None = None,
) -> User:
    """Set attendance start date (first activation only) and remove pre-start records."""
    if user.role == UserRole.ADMIN:
        raise ValidationAppError("Admin accounts do not participate in attendance.", code="ATTENDANCE_EXEMPT")
    _ensure_profile(db, user)
    if user.profile.attendance_start_date is None:
        user.profile.attendance_start_date = start_date or business_date_for_instant(datetime.now(shop_tz()))
        db.flush()
    purge_pre_start_attendance_records(db, user)
    return user


def purge_pre_start_attendance_records(db: Session, user: User) -> int:
    start = attendance_start_date_for(user)
    if start is None:
        return 0
    deleted = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == user.id,
            AttendanceRecord.business_date < start,
        )
        .delete(synchronize_session=False)
    )
    return deleted


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = radians(lat1), radians(lat2)
    d_phi = radians(lat2 - lat1)
    d_lambda = radians(lon2 - lon1)
    a = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
    return 2 * _EARTH_RADIUS_M * asin(sqrt(a))


def get_settings(db: Session) -> AttendanceSettings:
    row = db.query(AttendanceSettings).order_by(AttendanceSettings.created_at.asc()).first()
    if row is None:
        row = AttendanceSettings(
            latitude=Decimal("6.5244"),
            longitude=Decimal("3.3792"),
            location_label="Remarkable Barbershop",
            radius_meters=100,
            late_time=time(9, 0),
            late_deduction_amount=Decimal("500"),
            absence_deduction_amount=Decimal("2000"),
        )
        db.add(row)
        db.flush()
    return row


def serialize_settings(row: AttendanceSettings) -> dict:
    return {
        "latitude": str(row.latitude),
        "longitude": str(row.longitude),
        "location_label": row.location_label,
        "radius_meters": row.radius_meters,
        "late_time": row.late_time.strftime("%H:%M"),
        "late_deduction_amount": str(row.late_deduction_amount),
        "absence_deduction_amount": str(row.absence_deduction_amount),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def update_settings(
    db: Session,
    *,
    actor: User,
    latitude: Decimal,
    longitude: Decimal,
    location_label: str,
    radius_meters: int,
    late_time: time,
    late_deduction_amount: Decimal,
    absence_deduction_amount: Decimal,
) -> AttendanceSettings:
    row = get_settings(db)
    row.latitude = latitude
    row.longitude = longitude
    row.location_label = location_label
    row.radius_meters = radius_meters
    row.late_time = late_time
    row.late_deduction_amount = late_deduction_amount
    row.absence_deduction_amount = absence_deduction_amount
    row.updated_by_user_id = actor.id
    db.flush()
    return row


def user_off_days(user: User) -> set[int]:
    raw = user.profile.attendance_off_days if user.profile else None
    if not raw:
        return set()
    return {int(d) for d in raw if isinstance(d, int) or str(d).isdigit()}


def is_global_off_day(business_date: date) -> bool:
    return business_date.weekday() == _SUNDAY


def is_user_off_day(user: User, business_date: date) -> bool:
    if is_global_off_day(business_date):
        return True
    return business_date.weekday() in user_off_days(user)


def is_within_radius(
    *,
    latitude: Decimal | float,
    longitude: Decimal | float,
    settings: AttendanceSettings,
) -> bool:
    dist = _haversine_meters(
        float(latitude),
        float(longitude),
        float(settings.latitude),
        float(settings.longitude),
    )
    return dist <= float(settings.radius_meters)


def _local_sign_in_time(now: datetime) -> time:
    return now.astimezone(shop_tz()).time()


def get_record_for_date(db: Session, *, user_id: uuid.UUID, business_date: date) -> AttendanceRecord | None:
    return (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == user_id,
            AttendanceRecord.business_date == business_date,
        )
        .one_or_none()
    )


def serialize_record(row: AttendanceRecord, *, waived_by: User | None = None) -> dict:
    is_waived = row.waived_at is not None
    waived_by_payload = None
    if is_waived and waived_by is not None:
        waived_by_payload = {
            "id": str(waived_by.id),
            "username": waived_by.username,
            "full_name": waived_by.profile.full_name if waived_by.profile else None,
        }
    elif is_waived and row.waived_by_user_id is not None:
        waived_by_payload = {"id": str(row.waived_by_user_id)}

    return {
        "id": str(row.id),
        "user_id": str(row.user_id),
        "business_date": row.business_date.isoformat(),
        "signed_in_at": row.signed_in_at.isoformat() if row.signed_in_at else None,
        "status": str(row.status),
        "deduction_amount": str(row.deduction_amount),
        "deduction_reason": row.deduction_reason,
        "sign_in_latitude": str(row.sign_in_latitude) if row.sign_in_latitude is not None else None,
        "sign_in_longitude": str(row.sign_in_longitude) if row.sign_in_longitude is not None else None,
        "is_waived": is_waived,
        "waived_at": row.waived_at.isoformat() if row.waived_at else None,
        "waiver_reason": row.waiver_reason,
        "original_deduction_amount": (
            str(row.original_deduction_amount) if row.original_deduction_amount is not None else None
        ),
        "waived_by": waived_by_payload,
    }


def today_context(db: Session, user: User, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(shop_tz())
    today = business_date_for_instant(now)
    settings = get_settings(db)
    off_day = is_user_off_day(user, today)
    sunday = is_global_off_day(today)
    record = get_record_for_date(db, user_id=user.id, business_date=today)
    tracking_active = is_attendance_tracking_active(user, today)
    start = attendance_start_date_for(user)
    can_sign_in = tracking_active and not off_day and record is None
    return {
        "business_date": today.isoformat(),
        "is_sunday": sunday,
        "is_off_day": off_day and not sunday,
        "can_sign_in": can_sign_in,
        "attendance_tracking_active": tracking_active,
        "attendance_start_date": start.isoformat() if start else None,
        "settings_configured": True,
        "late_time": settings.late_time.strftime("%H:%M"),
        "radius_meters": settings.radius_meters,
        "record": serialize_record(record) if record else None,
    }


def sign_in(
    db: Session,
    *,
    user: User,
    latitude: Decimal,
    longitude: Decimal,
    now: datetime | None = None,
) -> AttendanceRecord:
    if not is_attendance_subject(user):
        raise ForbiddenError("Attendance sign-in is not required for your role", code="ATTENDANCE_EXEMPT")

    now = now or datetime.now(shop_tz())
    today = business_date_for_instant(now)

    if attendance_start_date_for(user) is None:
        activate_user_attendance(db, user=user, start_date=today)

    if not is_attendance_tracking_active(user, today):
        raise ForbiddenError(
            "Attendance tracking is not active for your account yet.",
            code="ATTENDANCE_NOT_ACTIVE",
        )

    if is_user_off_day(user, today):
        raise ValidationAppError("Today is an off-day — attendance is not required.", code="OFF_DAY")

    existing = get_record_for_date(db, user_id=user.id, business_date=today)
    if existing is not None:
        raise ConflictError("You have already signed in for today.", code="ALREADY_SIGNED_IN")

    settings = get_settings(db)
    if not is_within_radius(latitude=latitude, longitude=longitude, settings=settings):
        raise ValidationAppError(
            "You are outside the allowed attendance radius.",
            code="OUTSIDE_RADIUS",
        )

    sign_in_time = _local_sign_in_time(now)
    if sign_in_time <= settings.late_time:
        status = AttendanceStatus.ON_TIME
        deduction = _ZERO
        reason = None
    else:
        status = AttendanceStatus.LATE
        deduction = Decimal(settings.late_deduction_amount)
        reason = "late"

    row = AttendanceRecord(
        user_id=user.id,
        business_date=today,
        signed_in_at=now,
        sign_in_latitude=latitude,
        sign_in_longitude=longitude,
        status=status,
        deduction_amount=deduction,
        deduction_reason=reason,
    )
    db.add(row)
    db.flush()
    return row


def _ensure_absence(
    db: Session,
    *,
    user: User,
    business_date: date,
    settings: AttendanceSettings,
) -> AttendanceRecord | None:
    if not is_attendance_tracking_active(user, business_date):
        return None
    if is_user_off_day(user, business_date):
        return None
    if get_record_for_date(db, user_id=user.id, business_date=business_date):
        return None

    row = AttendanceRecord(
        user_id=user.id,
        business_date=business_date,
        signed_in_at=None,
        status=AttendanceStatus.ABSENT,
        deduction_amount=Decimal(settings.absence_deduction_amount),
        deduction_reason="absence",
        notes="System-marked absence",
    )
    db.add(row)
    db.flush()
    return row


def process_absences_for_user(
    db: Session,
    user: User,
    *,
    through_date: date | None = None,
) -> int:
    """Mark past business days without sign-in as absent (excluding off-days)."""
    purge_pre_start_attendance_records(db, user)
    if not is_attendance_subject(user):
        return 0

    start = attendance_start_date_for(user)
    if start is None:
        return 0

    tz = shop_tz()
    today = business_date_for_instant(datetime.now(tz))
    end = through_date or (today - timedelta(days=1))
    if end >= today:
        end = today - timedelta(days=1)
    if end < start:
        return 0
    if end < date(2020, 1, 1):
        return 0

    settings = get_settings(db)
    created = 0
    cursor = max(end.replace(day=1), start)
    while cursor <= end:
        if not is_user_off_day(user, cursor):
            if _ensure_absence(db, user=user, business_date=cursor, settings=settings):
                created += 1
        cursor += timedelta(days=1)
    return created


def process_all_absences(db: Session) -> int:
    users = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(
            User.role.in_(_ATTENDANCE_ROLES),
            User.account_status == AccountStatus.ACTIVE,
        )
        .all()
    )
    total = 0
    for user in users:
        total += process_absences_for_user(db, user)
    return total


def reconcile_all_attendance(db: Session) -> int:
    """Purge invalid pre-start records and sync absences for all active subjects."""
    return process_all_absences(db)


def list_records(
    db: Session,
    *,
    user_id: uuid.UUID,
    year: int | None = None,
    month: int | None = None,
    page: int = 1,
    page_size: int = 10,
) -> tuple[list[AttendanceRecord], int]:
    q = db.query(AttendanceRecord).filter(AttendanceRecord.user_id == user_id)
    if year is not None and month is not None:
        start = date(year, month, 1)
        last_day = calendar.monthrange(year, month)[1]
        end = date(year, month, last_day)
        q = q.filter(AttendanceRecord.business_date >= start, AttendanceRecord.business_date <= end)

        user = (
            db.query(User)
            .options(joinedload(User.profile))
            .filter(User.id == user_id)
            .one_or_none()
        )
        if user is not None:
            tracking_start = resolve_attendance_start_date(db, user, persist=False)
            if tracking_start is not None and tracking_start > start:
                q = q.filter(AttendanceRecord.business_date >= tracking_start)

    total = q.count()
    rows = (
        q.order_by(AttendanceRecord.business_date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return rows, total


def month_deduction_summary(
    db: Session,
    *,
    user_id: uuid.UUID,
    year: int,
    month: int,
) -> dict:
    start = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end = date(year, month, last_day)

    user = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(User.id == user_id)
        .one_or_none()
    )
    tracking_start = resolve_attendance_start_date(db, user, persist=True) if user else None
    if tracking_start is None:
        return {
            "year": year,
            "month": month,
            "late_deductions_total": str(_ZERO),
            "absence_deductions_total": str(_ZERO),
            "total_deductions": str(_ZERO),
            "items": [],
        }
    if tracking_start > end:
        return {
            "year": year,
            "month": month,
            "late_deductions_total": str(_ZERO),
            "absence_deductions_total": str(_ZERO),
            "total_deductions": str(_ZERO),
            "items": [],
        }
    effective_start = max(start, tracking_start) if tracking_start else start

    rows = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == user_id,
            AttendanceRecord.business_date >= effective_start,
            AttendanceRecord.business_date <= end,
            AttendanceRecord.deduction_amount > 0,
        )
        .order_by(AttendanceRecord.business_date.asc())
        .all()
    )
    late_total = _ZERO
    absence_total = _ZERO
    items = []
    for r in rows:
        amt = Decimal(r.deduction_amount)
        if r.deduction_reason == "late":
            late_total += amt
        elif r.deduction_reason == "absence":
            absence_total += amt
        items.append(
            {
                "business_date": r.business_date.isoformat(),
                "status": str(r.status),
                "deduction_amount": str(amt),
                "deduction_reason": r.deduction_reason,
                "signed_in_at": r.signed_in_at.isoformat() if r.signed_in_at else None,
            }
        )
    total = late_total + absence_total
    return {
        "year": year,
        "month": month,
        "late_deductions_total": str(late_total),
        "absence_deductions_total": str(absence_total),
        "total_deductions": str(total),
        "items": items,
    }


def attendance_deductions_total(
    db: Session,
    *,
    user_id: uuid.UUID,
    year: int,
    month: int,
) -> Decimal:
    summary = month_deduction_summary(db, user_id=user_id, year=year, month=month)
    return Decimal(summary["total_deductions"])


def update_user_off_days(
    db: Session,
    *,
    user: User,
    off_days: list[int],
    attendance_start_date: date | None = None,
) -> User:
    if user.role == UserRole.ADMIN:
        raise ValidationAppError("Admin accounts do not participate in attendance.", code="ATTENDANCE_EXEMPT")
    _ensure_profile(db, user)
    if attendance_start_date is not None:
        if user.profile.attendance_start_date is None:
            user.profile.attendance_start_date = attendance_start_date
        elif attendance_start_date > user.profile.attendance_start_date:
            user.profile.attendance_start_date = attendance_start_date
            purge_pre_start_attendance_records(db, user)
    elif user.profile.attendance_start_date is None:
        activate_user_attendance(db, user=user)
    user.profile.attendance_off_days = off_days
    db.flush()
    purge_pre_start_attendance_records(db, user)
    return user


def serialize_user_attendance_config(user: User) -> dict:
    start = attendance_start_date_for(user)
    return {
        "attendance_off_days": sorted(user_off_days(user)),
        "attendance_start_date": start.isoformat() if start else None,
    }


def get_attendance_user(db: Session, user_id: uuid.UUID) -> User:
    user = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(User.id == user_id)
        .one_or_none()
    )
    if user is None:
        raise NotFoundError("User not found", code="USER_NOT_FOUND")
    if user.role == UserRole.ADMIN:
        raise ValidationAppError("Admin accounts do not participate in attendance.", code="ATTENDANCE_EXEMPT")
    return user


def list_attendance_roster(db: Session) -> list[User]:
    return (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(
            User.role.in_(_ATTENDANCE_ROLES),
            User.account_status == AccountStatus.ACTIVE,
        )
        .order_by(_ATTENDANCE_ROLE_ORDER.asc(), User.username.asc())
        .all()
    )


def _record_has_penalty(row: AttendanceRecord) -> bool:
    if row.waived_at is not None:
        return False
    if row.deduction_amount > 0:
        return True
    return row.status in (AttendanceStatus.LATE, AttendanceStatus.ABSENT)


def _apply_waiver_to_record(
    db: Session,
    *,
    record: AttendanceRecord,
    actor: User,
    reason: str,
    now: datetime,
) -> AttendanceRecord:
    if record.waived_at is not None:
        return record

    if record.deduction_amount <= 0 and record.status == AttendanceStatus.ON_TIME:
        raise ValidationAppError(
            "This attendance record has no penalty to waive.",
            code="NO_PENALTY",
        )

    if record.original_deduction_amount is None:
        record.original_deduction_amount = Decimal(record.deduction_amount)
    elif record.deduction_amount > 0:
        record.original_deduction_amount = Decimal(record.deduction_amount)

    record.deduction_amount = _ZERO
    record.waived_at = now
    record.waived_by_user_id = actor.id
    record.waiver_reason = reason.strip()
    db.flush()
    return record


def waive_attendance_record(
    db: Session,
    *,
    record: AttendanceRecord,
    actor: User,
    reason: str,
    now: datetime | None = None,
) -> AttendanceRecord:
    now = now or datetime.now(shop_tz())
    return _apply_waiver_to_record(db, record=record, actor=actor, reason=reason, now=now)


def _ensure_record_for_waiver(
    db: Session,
    *,
    user: User,
    business_date: date,
) -> AttendanceRecord | None:
    record = get_record_for_date(db, user_id=user.id, business_date=business_date)
    if record is not None:
        return record

    if not is_attendance_tracking_active(user, business_date):
        return None

    if is_user_off_day(user, business_date):
        return None

    settings = get_settings(db)
    return _ensure_absence(db, user=user, business_date=business_date, settings=settings)


def waive_user_attendance(
    db: Session,
    *,
    user: User,
    business_date: date,
    actor: User,
    reason: str,
    now: datetime | None = None,
) -> AttendanceRecord:
    now = now or datetime.now(shop_tz())
    record = _ensure_record_for_waiver(db, user=user, business_date=business_date)
    if record is None:
        raise ValidationAppError(
            "No attendance penalty found for this employee on the selected date.",
            code="NO_PENALTY",
        )
    return waive_attendance_record(db, record=record, actor=actor, reason=reason, now=now)


def waive_all_for_date(
    db: Session,
    *,
    business_date: date,
    actor: User,
    reason: str,
    now: datetime | None = None,
) -> list[AttendanceRecord]:
    now = now or datetime.now(shop_tz())
    settings = get_settings(db)
    roster = list_attendance_roster(db)

    for user in roster:
        if is_attendance_tracking_active(user, business_date) and not is_user_off_day(user, business_date):
            existing = get_record_for_date(db, user_id=user.id, business_date=business_date)
            if existing is None and business_date < business_date_for_instant(now):
                _ensure_absence(db, user=user, business_date=business_date, settings=settings)

    candidates = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.business_date == business_date,
            AttendanceRecord.waived_at.is_(None),
        )
        .all()
    )

    waived: list[AttendanceRecord] = []
    for record in candidates:
        if not _record_has_penalty(record):
            continue
        try:
            waived.append(waive_attendance_record(db, record=record, actor=actor, reason=reason, now=now))
        except ValidationAppError:
            continue
    return waived


def _load_waived_by_users(db: Session, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, User]:
    if not user_ids:
        return {}
    rows = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(User.id.in_(user_ids))
        .all()
    )
    return {row.id: row for row in rows}


def serialize_waiver_entry(
    record: AttendanceRecord,
    *,
    employee: User | None = None,
    waived_by: User | None = None,
) -> dict:
    employee_name = None
    if employee is not None:
        employee_name = employee.profile.full_name if employee.profile else None
        if not employee_name:
            employee_name = employee.username

    waived_by_name = None
    if waived_by is not None:
        waived_by_name = waived_by.profile.full_name if waived_by.profile else None
        if not waived_by_name:
            waived_by_name = waived_by.username

    original = record.original_deduction_amount
    if original is None and record.deduction_amount > 0:
        original = record.deduction_amount

    return {
        "id": str(record.id),
        "user_id": str(record.user_id),
        "employee_name": employee_name,
        "business_date": record.business_date.isoformat(),
        "status": str(record.status),
        "waiver_reason": record.waiver_reason,
        "waived_at": record.waived_at.isoformat() if record.waived_at else None,
        "waived_by_user_id": str(record.waived_by_user_id) if record.waived_by_user_id else None,
        "waived_by_name": waived_by_name,
        "original_deduction_amount": str(original) if original is not None else "0",
        "deduction_reason": record.deduction_reason,
        "is_bulk": False,
    }


def list_waivers_for_date(db: Session, *, business_date: date) -> list[dict]:
    rows = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.business_date == business_date,
            AttendanceRecord.waived_at.isnot(None),
        )
        .order_by(AttendanceRecord.waived_at.desc())
        .all()
    )
    if not rows:
        return []

    user_ids = {row.user_id for row in rows}
    waived_by_ids = {row.waived_by_user_id for row in rows if row.waived_by_user_id}
    users = _load_waived_by_users(db, user_ids | waived_by_ids)

    return [
        serialize_waiver_entry(
            row,
            employee=users.get(row.user_id),
            waived_by=users.get(row.waived_by_user_id) if row.waived_by_user_id else None,
        )
        for row in rows
    ]


def list_waiver_history(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    year: int | None = None,
    month: int | None = None,
) -> tuple[list[dict], int]:
    q = db.query(AttendanceRecord).filter(AttendanceRecord.waived_at.isnot(None))
    if year is not None and month is not None:
        start = date(year, month, 1)
        last_day = calendar.monthrange(year, month)[1]
        end = date(year, month, last_day)
        q = q.filter(
            AttendanceRecord.business_date >= start,
            AttendanceRecord.business_date <= end,
        )

    total = q.count()
    rows = (
        q.order_by(AttendanceRecord.waived_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    user_ids = {row.user_id for row in rows}
    waived_by_ids = {row.waived_by_user_id for row in rows if row.waived_by_user_id}
    users = _load_waived_by_users(db, user_ids | waived_by_ids)

    items = [
        serialize_waiver_entry(
            row,
            employee=users.get(row.user_id),
            waived_by=users.get(row.waived_by_user_id) if row.waived_by_user_id else None,
        )
        for row in rows
    ]
    return items, total


def count_waived_for_date(db: Session, *, business_date: date) -> int:
    return (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.business_date == business_date,
            AttendanceRecord.waived_at.isnot(None),
        )
        .count()
    )


def enrich_records_with_waived_by(db: Session, rows: list[AttendanceRecord]) -> list[dict]:
    waived_by_ids = {row.waived_by_user_id for row in rows if row.waived_by_user_id}
    users = _load_waived_by_users(db, waived_by_ids)
    return [
        serialize_record(row, waived_by=users.get(row.waived_by_user_id) if row.waived_by_user_id else None)
        for row in rows
    ]
