from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    BARBER = "barber"
    STAFF = "staff"


class AccountStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DELETED = "deleted"


class SalaryType(StrEnum):
    FIXED = "fixed"
    COMMISSION = "commission"
    FIXED_OR_COMMISSION = "fixed_or_commission"


class PaymentMethod(StrEnum):
    CASH = "cash"
    TRANSFER = "transfer"
    POS = "pos"
    CASH_SHOP = "cash_shop"
    ADMIN_TRANSFER = "admin_transfer"


class ExpensePaymentSource(StrEnum):
    """How an operational expense was funded (manager/admin expense entries)."""

    CASH_SHOP = "cash_shop"
    ADMIN_TRANSFER = "admin_transfer"


class LedgerEntryType(StrEnum):
    SERVICE = "service"
    SALE = "sale"
    EXPENSE = "expense"


class FinancialMonthState(StrEnum):
    """Operational accounting period lifecycle."""

    OPEN = "open"
    GRACE_PERIOD = "grace_period"
    LOCKED = "locked"


class RecordLifecycleState(StrEnum):
    ACTIVE = "active"
    DELETED = "deleted"
    PURGED = "purged"


class LedgerRecordStream(StrEnum):
    """Independent operational index stream for dual-entry reconciliation."""

    EMPLOYEE = "employee"
    MANAGER = "manager"


class LedgerReconciliationStatus(StrEnum):
    """Per-entry lifecycle for barber/manager financial alignment."""

    PENDING = "pending"
    APPROVED = "approved"
    ADJUSTED = "adjusted"
    AWAITING_BARBER_REVIEW = "awaiting_barber_review"
    SETTLED = "settled"
    DISPUTED = "disputed"
    LOCKED = "locked"
    MISSING_BARBER_ENTRY = "missing_barber_entry"
    MANAGER_OVERRIDE = "manager_override"
    PENDING_DELETE_CONFIRMATION = "pending_delete_confirmation"


class BarberDailySummaryStatus(StrEnum):
    OPEN = "open"
    AWAITING_BARBER_REVIEW = "awaiting_barber_review"
    DISPUTED = "disputed"
    SETTLED = "settled"
    ADMIN_PENDING = "admin_pending"
    SETTLED_BY_ADMIN = "settled_by_admin"


class ReconciliationTimelineEventType(StrEnum):
    BARBER_SUBMITTED = "barber_submitted"
    MANAGER_ADJUSTED = "manager_adjusted"
    MANAGER_APPROVED_SUMMARY = "manager_approved_summary"
    BARBER_ACCEPTED = "barber_accepted"
    BARBER_REJECTED = "barber_rejected"
    MANAGER_REVISED = "manager_revised"
    ADMIN_RESOLVED = "admin_resolved"
    ENTRY_SOFT_DELETED = "entry_soft_deleted"
    ENTRY_VOIDED = "entry_voided"
    ENTRY_VOID_REQUESTED = "entry_void_requested"
    ENTRY_PURGED = "entry_purged"
    MONTH_REOPENED = "month_reopened"


class AppNotificationType(StrEnum):
    PENDING_APPROVALS = "pending_approvals"
    UNRESOLVED_MISMATCH = "unresolved_mismatch"
    RECONCILIATION_REVIEW_REQUEST = "reconciliation_review_request"
    DISPUTE_REQUIRES_MANAGER = "dispute_requires_manager"
    DISPUTE_REQUIRES_ADMIN = "dispute_requires_admin"
    LOW_STOCK = "low_stock"


class CommissionPayoutState(StrEnum):
    UNPAID = "unpaid"
    PAID = "paid"


class ServiceTypeStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    ARCHIVED = "archived"


class AttendanceStatus(StrEnum):
    ON_TIME = "on_time"
    LATE = "late"
    ABSENT = "absent"


class InventoryStockMovementType(StrEnum):
    """Auditable stock ledger for barbershop retail inventory."""

    STOCK_IN = "stock_in"
    SALE = "sale"
    VOID_RESTORE = "void_restore"
    ADJUSTMENT = "adjustment"
    OPENING = "opening"
