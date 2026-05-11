from __future__ import annotations

import uuid

from app.models.enums import UserRole
from app.models.user import User


def require_roles(user: User, *roles: UserRole) -> None:
    if user.role not in roles:
        from app.core.exceptions import ForbiddenError

        raise ForbiddenError("Insufficient permissions", code="FORBIDDEN")


def require_admin(user: User) -> None:
    require_roles(user, UserRole.ADMIN)


def require_manager_or_admin(user: User) -> None:
    require_roles(user, UserRole.ADMIN, UserRole.MANAGER)


def require_barber(user: User) -> None:
    require_roles(user, UserRole.BARBER)


def require_staff_like(user: User) -> None:
    require_roles(user, UserRole.BARBER, UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)


def can_impersonate(admin: User) -> bool:
    return admin.role == UserRole.ADMIN


def assert_no_nested_impersonation(current_impersonator_id: uuid.UUID | None) -> None:
    if current_impersonator_id is not None:
        from app.core.exceptions import ForbiddenError

        raise ForbiddenError(
            "Nested impersonation is not allowed",
            code="NESTED_IMPERSONATION",
        )
