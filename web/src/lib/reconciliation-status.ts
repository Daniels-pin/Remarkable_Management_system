import type { LedgerEntryType, TransactionStatus } from "@/lib/ops-types";

/** Index comparison states from the backend reconciliation engine. */
export type ReconciliationComparisonStatus =
  | "matched"
  | "mismatch"
  | "missing_employee_entry"
  | "missing_manager_entry"
  | "waiting_for_reconciliation"
  | "employee_record_voided"
  | "manager_record_voided"
  | "pending_delete_confirmation";

export function isReconciliationComparisonStatus(
  value: string | null | undefined,
): value is ReconciliationComparisonStatus {
  return (
    value === "matched" ||
    value === "mismatch" ||
    value === "missing_employee_entry" ||
    value === "missing_manager_entry" ||
    value === "waiting_for_reconciliation" ||
    value === "employee_record_voided" ||
    value === "manager_record_voided" ||
    value === "pending_delete_confirmation"
  );
}

/** Map index comparison to a single UI transaction status. */
export function comparisonToTransactionStatus(
  comparison: string | null | undefined,
): TransactionStatus {
  switch (comparison) {
    case "matched":
      return "approved";
    case "mismatch":
      return "disputed";
    case "missing_employee_entry":
    case "missing_manager_entry":
    case "waiting_for_reconciliation":
    case "pending_delete_confirmation":
      return "pending";
    case "employee_record_voided":
    case "manager_record_voided":
      return "adjusted";
    default:
      return "pending";
  }
}

/** Map per-entry workflow status when comparison is unavailable. */
export function workflowToTransactionStatus(
  raw: string | null | undefined,
): TransactionStatus {
  switch (raw) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "adjusted":
      return "adjusted";
    case "awaiting_barber_review":
      return "awaiting_review";
    case "settled":
      return "settled";
    case "disputed":
      return "disputed";
    case "locked":
      return "locked";
    case "missing_barber_entry":
    case "manager_override":
      return "approved";
    default:
      return "pending";
  }
}

/**
 * Resolve one display/filter status for a ledger line.
 * Service entries use index comparison when present; sales/expenses are always approved.
 */
export function resolveTransactionStatus(opts: {
  entryType?: LedgerEntryType;
  comparisonStatus?: string | null;
  workflowStatus?: string | null;
}): TransactionStatus {
  if (opts.entryType === "sale" || opts.entryType === "expense") {
    return "approved";
  }
  if (opts.comparisonStatus) {
    return comparisonToTransactionStatus(opts.comparisonStatus);
  }
  return workflowToTransactionStatus(opts.workflowStatus);
}

export type ReconciliationInboxFilter = "pending" | "mismatch";

/** Whether a service row belongs in the Pending or Mismatch inbox filter. */
export function matchesReconciliationInboxFilter(
  comparisonStatus: string | null | undefined,
  filter: ReconciliationInboxFilter,
): boolean {
  if (filter === "pending") {
    return (
      comparisonStatus === "missing_manager_entry" ||
      comparisonStatus === "missing_employee_entry" ||
      comparisonStatus === "waiting_for_reconciliation"
    );
  }
  return comparisonStatus === "mismatch";
}

export function countReconciliationInbox(
  rows: { comparisonStatus?: string | null; type?: string }[],
  filter: ReconciliationInboxFilter,
): number {
  return rows.filter(
    (r) =>
      r.type === "service" &&
      matchesReconciliationInboxFilter(r.comparisonStatus, filter),
  ).length;
}

/** @deprecated Use matchesReconciliationInboxFilter for Daily Ledger chips. */
export function matchesReconciliationFilter(
  status: TransactionStatus,
  filter: "pending" | "approved" | "disputed",
): boolean {
  if (filter === "pending") return status === "pending";
  if (filter === "approved") {
    return status === "approved" || status === "settled" || status === "adjusted";
  }
  return status === "disputed";
}

export type ReconciliationAmountFields = {
  amount?: string | null;
  display_amount?: string | null;
  employee_amount?: string | null;
  manager_amount?: string | null;
  employee?: { amount?: string | null } | null;
  manager?: { amount?: string | null } | null;
};

function parseAmount(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Official operational amount for display and feed rows.
 * Manager/admin stream is authoritative when present; otherwise employee stream.
 */
export function resolveOperationalDisplayAmount(row: ReconciliationAmountFields): number {
  const manager =
    parseAmount(row.manager_amount) ??
    (row.manager?.amount != null ? parseAmount(row.manager.amount) : null);
  const employee =
    parseAmount(row.employee_amount) ??
    (row.employee?.amount != null ? parseAmount(row.employee.amount) : null);
  const legacy = parseAmount(row.display_amount) ?? parseAmount(row.amount);

  if (manager != null) return manager;
  if (employee != null) return employee;
  return legacy ?? 0;
}

export function rowHighlightFromComparison(status: string): string {
  switch (status) {
    case "mismatch":
      return "bg-rose-500/[0.03] hover:bg-rose-500/[0.06]";
    case "missing_employee_entry":
    case "missing_manager_entry":
    case "waiting_for_reconciliation":
    case "pending_delete_confirmation":
      return "bg-amber-500/[0.03] hover:bg-amber-500/[0.06]";
    case "employee_record_voided":
    case "manager_record_voided":
      return "opacity-55 hover:opacity-70";
    default:
      return "hover:bg-[var(--muted)]/25";
  }
}
