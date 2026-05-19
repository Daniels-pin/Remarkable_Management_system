from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import PaymentMethod


class BarberServiceCreateBody(BaseModel):
    occurred_at: datetime
    service_type_id: UUID
    amount: Decimal = Field(..., gt=0)
    note: str | None = None


class BarberServiceUpdateBody(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    service_type_id: UUID | None = None
    note: str | None = None


class ManagerProposeSummaryBody(BaseModel):
    entry_amounts: dict[UUID, Decimal] | None = None
    mark_missing_barber_submission: bool = False


class ManagerReviseSummaryBody(BaseModel):
    entry_amounts: dict[UUID, Decimal] | None = None


class ManagerOfficialLineBody(BaseModel):
    barber_user_id: UUID
    occurred_at: datetime
    service_type_id: UUID
    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    note: str | None = None


class ReconciliationMatchBody(BaseModel):
    payment_method: PaymentMethod


class ReconciliationMatchAllBody(BaseModel):
    payment_method: PaymentMethod


class ReconciliationMismatchResolveBody(BaseModel):
    employee_entry_id: UUID


class BarberRejectBody(BaseModel):
    reason: str = Field(..., min_length=1)


class AdminResolveDisputeBody(BaseModel):
    final_day_total: Decimal = Field(..., ge=0)
    note: str = Field(..., min_length=1)


class PurgeLedgerBody(BaseModel):
    reason: str = Field(..., min_length=1)


class VoidLedgerBody(BaseModel):
    reason: str = Field(..., min_length=1)


class LedgerEntryUpdateBody(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    service_type_id: UUID | None = None
    sale_category_id: UUID | None = None
    expense_category_id: UUID | None = None
    note: str | None = None


class CommissionMarkPaidBody(BaseModel):
    payment_date: datetime
    paid_by_label: str = Field(..., min_length=1)
    note: str | None = None
