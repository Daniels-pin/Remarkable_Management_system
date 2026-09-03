"use client";

import type { FurnitureInvoiceStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<FurnitureInvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  voided: "Voided",
  completed: "Completed",
};

const STATUS_CLASSES: Record<FurnitureInvoiceStatus, string> = {
  draft: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  sent: "bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
  partially_paid: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  overdue: "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
  cancelled: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  voided: "bg-slate-300 text-slate-600 dark:bg-slate-700 dark:text-slate-400 line-through",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
};

export function FurnitureInvoiceStatusBadge({
  status,
  className,
}: {
  status: FurnitureInvoiceStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        STATUS_CLASSES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
