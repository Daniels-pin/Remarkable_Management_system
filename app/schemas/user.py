from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import AccountStatus, SalaryType, UserRole
from app.schemas.common import ORMModel


class UserProfileSelfUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=255)
    address: str | None = None
    phone: str | None = Field(None, max_length=32)
    bank_name: str | None = Field(None, max_length=128)
    account_number: str | None = Field(None, max_length=64)
    account_name: str | None = Field(None, max_length=255)


class UserProfileResponse(ORMModel):
    full_name: str | None
    address: str | None
    phone: str | None
    bank_name: str | None
    account_number: str | None
    account_name: str | None


class UserMeResponse(ORMModel):
    id: UUID
    email: str
    username: str
    role: UserRole
    account_status: AccountStatus
    must_change_password: bool
    avatar_seed: str | None
    salary_type: SalaryType | None
    commission_pct: Decimal | None
    fixed_salary: Decimal | None
    profile: UserProfileResponse | None
