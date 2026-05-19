"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { formatNaira } from "@/lib/format";
import { resolveActualPayout } from "@/lib/payout";
import { cn } from "@/lib/utils";

export type PayoutAttendanceBreakdown = {
  expectedPayout: number;
  actualPayout: number;
  attendanceDeductionsTotal: number;
  lateDeductionsTotal?: number;
  absenceDeductionsTotal?: number;
};

type Props = {
  data: PayoutAttendanceBreakdown;
  expectedLabel?: string;
  actualLabel?: string;
  penaltiesLabel?: string;
  className?: string;
  compact?: boolean;
};

export function PayoutWithAttendance({
  data,
  expectedLabel = "Expected payout",
  actualLabel = "Actual payout",
  penaltiesLabel = "Attendance penalties",
  className,
  compact = false,
}: Props) {
  const [expanded, setExpanded] = React.useState(false);
  const expected = data.expectedPayout;
  const deductions = data.attendanceDeductionsTotal;
  const actual = resolveActualPayout(expected, data.actualPayout, deductions);
  const hasPenalties = deductions > 0;

  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              {expectedLabel}
            </p>
            <p className="text-sm font-medium tabular-nums text-[var(--foreground)]">
              {formatNaira(expected)}
            </p>
          </div>
          {hasPenalties ? (
            <div className="flex items-baseline justify-between gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200"
                onClick={() => setExpanded((v) => !v)}
              >
                {penaltiesLabel}
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
                />
              </button>
              <p className="text-sm font-medium tabular-nums text-amber-800 dark:text-amber-200">
                −{formatNaira(deductions)}
              </p>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border)]/70 pt-1.5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              {actualLabel}
            </p>
            <p className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatNaira(actual)}
            </p>
          </div>
        </div>
        {hasPenalties && expanded ? (
          <PenaltyBreakdown
            data={{ ...data, actualPayout: actual }}
            className="rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--muted)]/15 px-3 py-2"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--muted)]/10 px-3 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            {expectedLabel}
          </p>
          <p className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
            {formatNaira(expected)}
          </p>
        </div>
        {hasPenalties ? (
          <div className="flex items-baseline justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200"
              onClick={() => setExpanded((v) => !v)}
            >
              {penaltiesLabel}
              <ChevronDown
                className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
              />
            </button>
            <p className="text-base font-semibold tabular-nums text-amber-800 dark:text-amber-200">
              −{formatNaira(deductions)}
            </p>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border)]/70 pt-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            {actualLabel}
          </p>
          <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatNaira(actual)}
          </p>
        </div>
      </div>

      {hasPenalties && expanded ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--muted)]/15 px-3 py-3">
          <PenaltyBreakdown data={{ ...data, actualPayout: actual }} />
        </div>
      ) : null}
    </div>
  );
}

function PenaltyBreakdown({
  data,
  className,
}: {
  data: PayoutAttendanceBreakdown;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-2 text-xs sm:grid-cols-3", className)}>
      <div>
        <dt className="text-[var(--muted-foreground)]">Late penalties</dt>
        <dd className="mt-0.5 font-medium tabular-nums">
          {formatNaira(data.lateDeductionsTotal ?? 0)}
        </dd>
      </div>
      <div>
        <dt className="text-[var(--muted-foreground)]">Absence penalties</dt>
        <dd className="mt-0.5 font-medium tabular-nums">
          {formatNaira(data.absenceDeductionsTotal ?? 0)}
        </dd>
      </div>
      <div>
        <dt className="text-[var(--muted-foreground)]">Total deductions</dt>
        <dd className="mt-0.5 font-semibold tabular-nums text-amber-800 dark:text-amber-200">
          {formatNaira(data.attendanceDeductionsTotal)}
        </dd>
      </div>
    </dl>
  );
}
