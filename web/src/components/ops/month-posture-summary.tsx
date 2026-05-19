"use client";

import type { ReactNode } from "react";

import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MonthPostureData = {
  pendingTotal: number;
  approvedTotal: number;
  mismatchIndexes: number[];
};

function formatIndexLabel(index: number) {
  return `#${String(index).padStart(3, "0")}`;
}

export function MonthPostureSummary({
  data,
  className,
}: {
  data: MonthPostureData;
  className?: string;
}) {
  const hasMismatch = data.mismatchIndexes.length > 0;

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
            {data.mismatchIndexes.map((idx) => (
              <li
                key={idx}
                className="font-mono text-sm font-medium tabular-nums tracking-tight text-rose-900/90 dark:text-rose-100/90"
              >
                {formatIndexLabel(idx)}
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
  children,
}: {
  label: string;
  hint: string;
  tone: "amber" | "emerald" | "rose";
  alert?: boolean;
  children: ReactNode;
}) {
  const accent = {
    amber: "border-amber-500/20 bg-amber-500/[0.04]",
    emerald: "border-emerald-500/20 bg-emerald-500/[0.04]",
    rose: alert
      ? "border-rose-400/30 bg-rose-500/[0.06] ring-1 ring-rose-500/10"
      : "border-[var(--border)] bg-[var(--card)]",
  }[tone];

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border px-4 py-3.5 transition-colors",
        accent,
      )}
    >
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          {label}
        </p>
        <p className="text-[11px] leading-snug text-[var(--muted-foreground)]/80">{hint}</p>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
