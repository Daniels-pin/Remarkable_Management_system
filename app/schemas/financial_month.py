from pydantic import BaseModel, Field


class FinancialMonthCloseBody(BaseModel):
    note: str | None = Field(default=None, max_length=500)
