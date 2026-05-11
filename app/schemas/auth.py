from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    username_or_email: str = Field(..., min_length=1, max_length=320)
    password: str = Field(..., min_length=1, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class SessionInfoResponse(BaseModel):
    user_id: UUID
    role: UserRole
    must_change_password: bool
    expires_at: datetime
    seconds_until_expiry: int
    impersonating: bool
    impersonator_user_id: UUID | None = None
