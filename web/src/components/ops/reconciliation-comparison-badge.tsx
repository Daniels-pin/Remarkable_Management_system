"use client";

import { cn } from "@/lib/utils";

export type ReconciliationComparisonStatus =
  | "matched"
  | "mismatch"
  | "missing_employee_entry"
  | "missing_manager_entry"
  | "adjusted"
  | "settled"
  | "disputed";

const LABELS: Record<ReconciliationComparisonStatus, string> = {
  matched: "Matched",
  mismatch: "Mismatch",
  missing_employee_entry: "Missing Employee Entry",
  missing_manager_entry: "Missing Manager Entry",
  adjusted: "Adjusted",
  settled: "Settled",
  disputed: "Disputed",
};

const STYLES: Record<ReconciliationComparisonStatus, string> = {
  matched:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  mismatch: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  missing_employee_entry:
    "border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-200",
  missing_manager_entry:
    "border-violet-500/25 bg-violet-500/10 text-violet-900 dark:text-violet-200",
  adjusted: "border-[var(--border)] bg-[var(--muted)]/50 text-[var(--foreground)]",
  settled: "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
  disputed: "border-rose-500/25 bg-rose-500/10 text-rose-900 dark:text-rose-200",
};

export function ReconciliationComparisonBadge({
  status,
}: {
  status: ReconciliationComparisonStatus | string;
}) {
  const key = status as ReconciliationComparisonStatus;
  const label = LABELS[key] ?? status.replace(/_/g, " ");
  const style = STYLES[key] ?? STYLES.adjusted;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-wide",
        style,
      )}
    >
      {label}
    </span>
  );
}
