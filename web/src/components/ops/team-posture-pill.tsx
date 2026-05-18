"use client";

import type { ReconciliationPosture } from "@/lib/api";
import { cn } from "@/lib/utils";

const LABELS: Record<ReconciliationPosture, string> = {
  clear: "Clear",
  pending: "Pending",
  awaiting_review: "Awaiting review",
  in_review: "In review",
  settled: "Settled",
  disputed: "Disputed",
};

const STYLES: Record<ReconciliationPosture, string> = {
  clear: "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
  pending: "bg-amber-500/12 text-amber-900 dark:text-amber-200 border-amber-500/25",
  awaiting_review: "bg-violet-500/10 text-violet-900 dark:text-violet-200 border-violet-500/20",
  in_review: "bg-sky-500/10 text-sky-900 dark:text-sky-200 border-sky-500/20",
  settled: "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 border-emerald-500/20",
  disputed: "bg-rose-500/10 text-rose-900 dark:text-rose-200 border-rose-500/25",
};

export function TeamPosturePill({ posture }: { posture: ReconciliationPosture }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        STYLES[posture],
      )}
    >
      {LABELS[posture]}
    </span>
  );
}
