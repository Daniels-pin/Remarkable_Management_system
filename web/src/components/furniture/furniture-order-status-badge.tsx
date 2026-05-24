"use client";

import type { FurnitureOrderStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const LABELS: Record<FurnitureOrderStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

const STYLES: Record<FurnitureOrderStatus, string> = {
  pending:
    "bg-amber-500/15 text-amber-950 dark:text-amber-100 border-amber-500/35 ring-1 ring-amber-500/20",
  in_progress:
    "bg-sky-500/12 text-sky-950 dark:text-sky-100 border-sky-500/30 ring-1 ring-sky-500/15",
  completed:
    "bg-emerald-500/12 text-emerald-950 dark:text-emerald-100 border-emerald-500/25",
};

export function FurnitureOrderStatusBadge({ status }: { status: FurnitureOrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        STYLES[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}
