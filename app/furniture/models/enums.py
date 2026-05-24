from enum import StrEnum


class FurnitureOrderStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class FurnitureQuotationStatus(StrEnum):
    DRAFT = "draft"
    FINALIZED = "finalized"
    CONVERTED = "converted"
