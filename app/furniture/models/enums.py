from enum import StrEnum


class FurnitureOrderStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class FurnitureQuotationStatus(StrEnum):
    DRAFT = "draft"
    FINALIZED = "finalized"
    CONVERTED = "converted"


class FurnitureInvoiceStatus(StrEnum):
    DRAFT = "draft"
    SENT = "sent"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"
    VOIDED = "voided"
    COMPLETED = "completed"


class FurnitureInvoiceSource(StrEnum):
    MANUAL = "manual"
    QUOTATION = "quotation"
    ORDER = "order"


class FurnitureInvoicePaymentScenario(StrEnum):
    NO_PAYMENT = "no_payment"
    ADVANCE_PAYMENT = "advance_payment"
    PAID_IN_FULL = "paid_in_full"
