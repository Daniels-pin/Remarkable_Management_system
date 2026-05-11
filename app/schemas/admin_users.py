from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.enums import AccountStatus, SalaryType, UserRole
from app.schemas.common import ORMModel


class AdminUserProfileBrief(ORMModel):
    full_name: str | None


class AdminUserListItem(BaseModel):
    id: UUID
    email: str
    username: str
    role: UserRole
    account_status: AccountStatus
    salary_type: SalaryType | None
    commission_pct: Decimal | None
    fixed_salary: Decimal | None
    avatar_seed: str | None
    must_change_password: bool
    profile: AdminUserProfileBrief | None
    last_active_at: datetime | None
    created_at: datetime | None


class AdminUserListResponse(BaseModel):
    items: list[AdminUserListItem]


class AdminUserCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    username: str = Field(..., min_length=2, max_length=64)
    temporary_password: str = Field(..., min_length=8, max_length=128)
    email: str | None = Field(None, max_length=320)
    role: UserRole
    salary_type: SalaryType | None = None
    commission_pct: Decimal | None = Field(None, ge=0, le=100)
    fixed_salary: Decimal | None = Field(None, ge=0)
    account_status: AccountStatus = AccountStatus.ACTIVE

    @field_validator("account_status")
    @classmethod
    def reject_deleted_on_create(cls, v: AccountStatus) -> AccountStatus:
        if v == AccountStatus.DELETED:
            raise ValueError("New users cannot be created with deleted status")
        return v

    @field_validator("username")
    @classmethod
    def username_chars(cls, v: str) -> str:
        s = v.strip()
        if not s.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, hyphens, and underscores")
        return s


class AdminUserUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=255)
    username: str | None = Field(None, min_length=2, max_length=64)
    email: str | None = Field(None, max_length=320)
    role: UserRole | None = None
    salary_type: SalaryType | None = None
    commission_pct: Decimal | None = Field(None, ge=0, le=100)
    fixed_salary: Decimal | None = Field(None, ge=0)
    account_status: AccountStatus | None = None

    @field_validator("username")
    @classmethod
    def username_chars(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not s.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, hyphens, and underscores")
        return s


class AdminUserDetail(AdminUserListItem):
    updated_at: datetime | None


class AdminPasswordResetResponse(BaseModel):
    temporary_password: str
    message: str = "Temporary password issued. The user must change password on next sign in."


class AdminFinancialMonthReopenBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=2000)
