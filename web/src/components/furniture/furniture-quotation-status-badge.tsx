"use client";

import { cn } from "@/lib/utils";
import type { FurnitureQuotationStatus } from "@/lib/api";

const STATUS_LABELS: Record<FurnitureQuotationStatus, string> = {
  draft: "Draft",
  finalized: "Finalized",
  converted: "Converted",
};

const STATUS_CLASSES: Record<FurnitureQuotationStatus, string> = {
  draft: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  finalized: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  converted: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

export function FurnitureQuotationStatusBadge({
  status,
  className,
}: {
  status: FurnitureQuotationStatus;
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
