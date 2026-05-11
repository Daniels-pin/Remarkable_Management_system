"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { TransactionStatus } from "@/lib/ops-types";

const LABELS: Record<TransactionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  adjusted: "Adjusted",
  awaiting_review: "Awaiting Review",
  settled: "Settled",
  disputed: "Disputed",
  locked: "Locked",
};

const STYLES: Record<TransactionStatus, string> = {
  pending: "bg-amber-500/12 text-amber-900 dark:text-amber-200 border-amber-500/25",
  approved: "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 border-emerald-500/20",
  adjusted: "bg-sky-500/10 text-sky-900 dark:text-sky-200 border-sky-500/20",
  awaiting_review: "bg-violet-500/10 text-violet-900 dark:text-violet-200 border-violet-500/20",
  settled: "bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)]",
  disputed: "bg-rose-500/10 text-rose-900 dark:text-rose-200 border-rose-500/25",
  locked: "bg-[var(--foreground)]/8 text-[var(--foreground)] border-[var(--border)]",
};

export function StatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        STYLES[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}
