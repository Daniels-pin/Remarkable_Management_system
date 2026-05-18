from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import ExpensePaymentSource, LedgerEntryType, PaymentMethod


class LedgerEntryCreateService(BaseModel):
    entry_type: LedgerEntryType = LedgerEntryType.SERVICE
    occurred_at: datetime
    service_type_id: UUID
    employee_user_id: UUID
    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    note: str | None = None


class LedgerEntryCreateSale(BaseModel):
    entry_type: LedgerEntryType = LedgerEntryType.SALE
    occurred_at: datetime
    sale_category_id: UUID
    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    note: str | None = None


class LedgerEntryCreateExpense(BaseModel):
    entry_type: LedgerEntryType = LedgerEntryType.EXPENSE
    occurred_at: datetime
    expense_category_id: UUID
    amount: Decimal = Field(..., gt=0)
    payment_method: ExpensePaymentSource
    note: str | None = None
