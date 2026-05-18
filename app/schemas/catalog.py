from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import ServiceTypeStatus


class ServiceTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    status: ServiceTypeStatus = ServiceTypeStatus.ACTIVE


class ServiceTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    status: ServiceTypeStatus | None = None


class SaleCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    status: ServiceTypeStatus = ServiceTypeStatus.ACTIVE


class SaleCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    status: ServiceTypeStatus | None = None


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    status: ServiceTypeStatus = ServiceTypeStatus.ACTIVE


class ExpenseCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    status: ServiceTypeStatus | None = None
