from __future__ import annotations

from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class AttendanceSettingsUpdate(BaseModel):
    latitude: Decimal = Field(..., ge=-90, le=90)
    longitude: Decimal = Field(..., ge=-180, le=180)
    location_label: str = Field(..., min_length=1, max_length=512)
    radius_meters: int = Field(..., ge=25, le=500)
    late_time: time
    late_deduction_amount: Decimal = Field(..., ge=0)
    absence_deduction_amount: Decimal = Field(..., ge=0)


class AttendanceSignInBody(BaseModel):
    latitude: Decimal = Field(..., ge=-90, le=90)
    longitude: Decimal = Field(..., ge=-180, le=180)


class AttendanceOffDaysUpdate(BaseModel):
    off_days: list[int] = Field(default_factory=list)
    attendance_start_date: date | None = None

    @field_validator("off_days")
    @classmethod
    def validate_weekdays(cls, v: list[int]) -> list[int]:
        cleaned = sorted({int(d) for d in v if 0 <= int(d) <= 6})
        if any(d == 6 for d in cleaned):
            raise ValueError("Sunday is globally off and cannot be assigned as an employee off-day")
        return cleaned


class AttendanceActivateBody(BaseModel):
    """Optional explicit start date; defaults to today in shop timezone."""

    attendance_start_date: date | None = None
