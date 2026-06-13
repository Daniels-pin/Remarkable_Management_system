"use client";

import type { ReactNode } from "react";

import { OperationalAlertBadge } from "@/components/ui/operational-alert-badge";
import { formatNaira } from "@/lib/format";
import { formatLedgerIndexLabel } from "@/lib/ledger-index";
import { cn } from "@/lib/utils";

export type MonthPostureData = {
  pendingTotal: number;
  approvedTotal: number;
  mismatchIndexes: number[];
  mismatchIndexLabels?: string[];
};

function formatMismatchLabel(
  index: number,
  label: string | undefined,
  year: number | undefined,
  month: number | undefined,
): string {
  if (label) return label;
  return formatLedgerIndexLabel("service", index, null, year, month);
}

export function MonthPostureSummary({
  data,
  pendingIndexCount,
  year,
  month,
  className,
}: {
  data: MonthPostureData;
  /** Actionable pending index count — synced with sidebar badge. */
  pendingIndexCount?: number;
  year?: number;
  month?: number;
  className?: string;
}) {
  const hasMismatch = data.mismatchIndexes.length > 0;
  const mismatchLabels =
    data.mismatchIndexLabels ??
    data.mismatchIndexes.map((idx) => formatMismatchLabel(idx, undefined, year, month));

  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      <PostureCard
        label="Approved"
        hint="Both sides matched · counts toward payout"
        tone="emerald"
      >
        <p className="font-[family-name:var(--font-serif)] text-2xl font-semibold tabular-nums tracking-tight text-emerald-800 dark:text-emerald-200">
          {formatNaira(data.approvedTotal)}
        </p>
      </PostureCard>

      <PostureCard
        label="Pending"
        hint="One-sided indexes · unreconciled value"
        tone="amber"
        labelAdornment={
          pendingIndexCount != null && pendingIndexCount > 0 ? (
            <OperationalAlertBadge count={pendingIndexCount} />
          ) : null
        }
      >
        <p className="font-[family-name:var(--font-serif)] text-2xl font-semibold tabular-nums tracking-tight text-amber-900 dark:text-amber-100">
          {formatNaira(data.pendingTotal)}
        </p>
      </PostureCard>

      <PostureCard
        label="Mismatch"
        hint="Indexes with conflicting amounts · no monetary total"
        tone="rose"
        alert={hasMismatch}
      >
        {hasMismatch ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
            {mismatchLabels.map((label, i) => (
              <li
                key={`${label}-${i}`}
                className="font-mono text-sm font-medium tabular-nums tracking-tight text-rose-900/90 dark:text-rose-100/90"
              >
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">All indexes aligned</p>
        )}
      </PostureCard>
    </div>
  );
}

function PostureCard({
  label,
  hint,
  tone,
  alert,
  labelAdornment,
  children,
}: {
  label: string;
  hint: string;
  tone: "emerald" | "amber" | "rose";
  alert?: boolean;
  labelAdornment?: ReactNode;
  children: ReactNode;
}) {
  const toneClasses = {
    emerald:
      "border-emerald-500/20 bg-emerald-500/[0.04] dark:border-emerald-500/25 dark:bg-emerald-950/20",
    amber:
      "border-amber-500/20 bg-amber-500/[0.04] dark:border-amber-500/25 dark:bg-amber-950/20",
    rose: alert
      ? "border-rose-500/25 bg-rose-500/[0.05] dark:border-rose-500/30 dark:bg-rose-950/25"
      : "border-[var(--border)] bg-[var(--card)]",
  };

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border px-4 py-3.5 shadow-[var(--shadow-card)]",
        toneClasses[tone],
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </p>
        {labelAdornment}
      </div>
      {children}
      <p className="mt-1.5 text-[10px] leading-snug text-[var(--muted-foreground)]">{hint}</p>
    </div>
  );
}
