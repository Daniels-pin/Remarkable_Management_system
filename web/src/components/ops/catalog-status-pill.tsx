"use client";

import type { CategoryStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

export function CatalogStatusPill({ status }: { status: CategoryStatus }) {
  const base =
    "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide";
  if (status === "active") {
    return (
      <span className={cn(base, "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200")}>
        Active
      </span>
    );
  }
  if (status === "disabled") {
    return (
      <span className={cn(base, "bg-amber-500/12 text-amber-900 dark:text-amber-200")}>
        Disabled
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-[var(--muted)]/60 text-[var(--muted-foreground)]")}>
      Archived
    </span>
  );
}
