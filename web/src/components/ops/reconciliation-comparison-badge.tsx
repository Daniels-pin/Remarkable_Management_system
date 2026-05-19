"use client";

import type { ReconciliationComparisonStatus } from "@/lib/reconciliation-status";
import { cn } from "@/lib/utils";

export type { ReconciliationComparisonStatus };

const LABELS: Record<ReconciliationComparisonStatus, string> = {
  matched: "Matched",
  mismatch: "Mismatch",
  missing_employee_entry: "No Employee Record",
  missing_manager_entry: "No Manager Record",
  waiting_for_reconciliation: "Waiting",
  employee_record_voided: "Employee voided",
  manager_record_voided: "Manager voided",
  pending_delete_confirmation: "Pending void",
};

const COMPACT_LABELS: Record<ReconciliationComparisonStatus, string> = {
  matched: "Matched",
  mismatch: "Mismatch",
  missing_employee_entry: "No employee",
  missing_manager_entry: "No manager",
  waiting_for_reconciliation: "Waiting",
  employee_record_voided: "Emp. voided",
  manager_record_voided: "Mgr. voided",
  pending_delete_confirmation: "Pending void",
};

const STYLES: Record<ReconciliationComparisonStatus, string> = {
  matched:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  mismatch: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  missing_employee_entry:
    "border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-200",
  missing_manager_entry:
    "border-violet-500/25 bg-violet-500/10 text-violet-900 dark:text-violet-200",
  waiting_for_reconciliation:
    "border-violet-500/25 bg-violet-500/10 text-violet-900 dark:text-violet-200",
  employee_record_voided:
    "border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)]",
  manager_record_voided:
    "border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)]",
  pending_delete_confirmation:
    "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

const FALLBACK_STYLE =
  "border-[var(--border)] bg-[var(--muted)]/50 text-[var(--foreground)]";

export function ReconciliationComparisonBadge({
  status,
  compact = false,
}: {
  status: ReconciliationComparisonStatus | string;
  compact?: boolean;
}) {
  const key = status as ReconciliationComparisonStatus;
  const label = compact
    ? (COMPACT_LABELS[key] ?? status.replace(/_/g, " "))
    : (LABELS[key] ?? status.replace(/_/g, " "));
  const style = STYLES[key] ?? FALLBACK_STYLE;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full border font-medium tracking-wide",
        compact ? "px-1.5 py-px text-[9px] leading-tight" : "px-2.5 py-0.5 text-[10px]",
        style,
      )}
    >
      {label}
    </span>
  );
}
