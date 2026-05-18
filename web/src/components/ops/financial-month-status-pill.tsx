"use client";

import {
  financialMonthStatusLabel,
  financialMonthStatusTone,
} from "@/lib/financial-month";
import { cn } from "@/lib/utils";

export function FinancialMonthStatusPill({ state }: { state: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        financialMonthStatusTone(state),
      )}
    >
      {financialMonthStatusLabel(state)}
    </span>
  );
}
