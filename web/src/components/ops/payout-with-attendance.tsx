"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { formatCatalogDate, formatNaira } from "@/lib/format";
import { resolveActualPayout } from "@/lib/payout";
import type { TeamAdvanceItem } from "@/lib/api";
import { cn } from "@/lib/utils";

export type PayoutAttendanceBreakdown = {
  expectedPayout: number;
  actualPayout: number;
  attendanceDeductionsTotal: number;
  lateDeductionsTotal?: number;
  absenceDeductionsTotal?: number;
  teamAdvancesTotal?: number;
  otherDeductionsTotal?: number;
  teamAdvanceItems?: TeamAdvanceItem[];
};

type Props = {
  data: PayoutAttendanceBreakdown;
  expectedLabel?: string;
  actualLabel?: string;
  penaltiesLabel?: string;
  advancesLabel?: string;
  className?: string;
  compact?: boolean;
};

export function PayoutWithAttendance({
  data,
  expectedLabel = "Expected payout",
  actualLabel = "Final payable",
  penaltiesLabel = "Attendance penalties",
  advancesLabel = "Team advances",
  className,
  compact = false,
}: Props) {
  const [penaltiesExpanded, setPenaltiesExpanded] = React.useState(false);
  const [advancesExpanded, setAdvancesExpanded] = React.useState(false);
  const expected = data.expectedPayout;
  const attendance = data.attendanceDeductionsTotal;
  const teamAdvances = data.teamAdvancesTotal ?? 0;
  const other = data.otherDeductionsTotal ?? 0;
  const actual = resolveActualPayout(
    expected,
    data.actualPayout,
    attendance,
    teamAdvances,
    other,
  );
  const hasPenalties = attendance > 0;
  const hasTeamAdvances = teamAdvances > 0;
  const hasOther = other > 0;

  const deductionRows = (
    <>
      {hasPenalties ? (
        <div className="flex items-baseline justify-between gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200"
            onClick={() => setPenaltiesExpanded((v) => !v)}
          >
            {penaltiesLabel}
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", penaltiesExpanded && "rotate-180")}
            />
          </button>
          <p className="text-sm font-medium tabular-nums text-amber-800 dark:text-amber-200">
            −{formatNaira(attendance)}
          </p>
        </div>
      ) : null}
      {hasTeamAdvances ? (
        <div className="flex items-baseline justify-between gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-rose-700 dark:text-rose-300"
            onClick={() => setAdvancesExpanded((v) => !v)}
          >
            {advancesLabel}
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", advancesExpanded && "rotate-180")}
            />
          </button>
          <p className="text-sm font-medium tabular-nums text-rose-700 dark:text-rose-300">
            −{formatNaira(teamAdvances)}
          </p>
        </div>
      ) : null}
      {hasOther ? (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Other deductions
          </p>
          <p className="text-sm font-medium tabular-nums text-[var(--muted-foreground)]">
            −{formatNaira(other)}
          </p>
        </div>
      ) : null}
    </>
  );

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
          {deductionRows}
          <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border)]/70 pt-1.5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              {actualLabel}
            </p>
            <p className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatNaira(actual)}
            </p>
          </div>
        </div>
        {hasPenalties && penaltiesExpanded ? (
          <PenaltyBreakdown data={{ ...data, actualPayout: actual }} />
        ) : null}
        {hasTeamAdvances && advancesExpanded ? (
          <TeamAdvanceList items={data.teamAdvanceItems ?? []} total={teamAdvances} compact />
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
        {deductionRows}
        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border)]/70 pt-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            {actualLabel}
          </p>
          <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatNaira(actual)}
          </p>
        </div>
      </div>

      {hasPenalties && penaltiesExpanded ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--muted)]/15 px-3 py-3">
          <PenaltyBreakdown data={{ ...data, actualPayout: actual }} />
        </div>
      ) : null}

      {hasTeamAdvances && advancesExpanded ? (
        <TeamAdvanceList items={data.teamAdvanceItems ?? []} total={teamAdvances} />
      ) : null}
    </div>
  );
}

function TeamAdvanceList({
  items,
  total,
  compact = false,
}: {
  items: TeamAdvanceItem[];
  total: number;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--muted)]/10",
        compact ? "px-3 py-2" : "px-3 py-3",
      )}
    >
      <ul className="divide-y divide-[var(--border)]/70">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-2.5 text-xs">
            <div className="min-w-0 space-y-0.5">
              {item.advance_type === "product" && item.product_name ? (
                <>
                  <p className="font-medium text-[var(--foreground)]">{item.product_name}</p>
                  {item.quantity != null ? (
                    <p className="text-[var(--muted-foreground)]">Qty: {item.quantity}</p>
                  ) : null}
                  <p className="text-[var(--muted-foreground)]">Product advance</p>
                </>
              ) : (
                <>
                  <p className="font-medium text-[var(--foreground)]">Cash advance</p>
                  {item.reason ? (
                    <p className="text-[var(--muted-foreground)]">{item.reason}</p>
                  ) : null}
                </>
              )}
              {item.business_date ? (
                <p className="text-[var(--muted-foreground)]">
                  {formatCatalogDate(item.business_date) ?? item.business_date}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 font-medium tabular-nums text-[var(--foreground)]">
              {formatNaira(Number(item.amount))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-[var(--border)]/70 pt-2 text-xs font-semibold tabular-nums text-[var(--foreground)]">
        Total team advances: {formatNaira(total)}
      </p>
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
        <dt className="text-[var(--muted-foreground)]">Total</dt>
        <dd className="mt-0.5 font-semibold tabular-nums text-amber-800 dark:text-amber-200">
          {formatNaira(data.attendanceDeductionsTotal)}
        </dd>
      </div>
    </dl>
  );
}
