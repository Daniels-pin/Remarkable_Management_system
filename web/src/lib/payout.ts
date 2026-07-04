import type { TeamAdvanceItem } from "@/lib/api";

/** Canonical net payout: expected minus attendance, team advances, and other payroll deductions. */

export function resolveActualPayout(
  expectedPayout: number,
  actualPayout: number | undefined | null,
  attendanceDeductionsTotal: number,
  teamAdvancesTotal = 0,
  otherDeductionsTotal = 0,
): number {
  if (actualPayout != null && Number.isFinite(actualPayout)) {
    return actualPayout;
  }
  const totalDeductions =
    attendanceDeductionsTotal + teamAdvancesTotal + otherDeductionsTotal;
  if (totalDeductions > 0) {
    return Math.max(0, expectedPayout - totalDeductions);
  }
  return expectedPayout;
}

export function normalizePayoutBreakdown(input: {
  expectedPayout: number;
  actualPayout?: number | null;
  attendanceDeductionsTotal: number;
  lateDeductionsTotal?: number;
  absenceDeductionsTotal?: number;
  teamAdvancesTotal?: number;
  otherDeductionsTotal?: number;
  teamAdvanceItems?: TeamAdvanceItem[];
}) {
  const teamAdvances = input.teamAdvancesTotal ?? 0;
  const otherDeductions = input.otherDeductionsTotal ?? 0;
  const actualPayout = resolveActualPayout(
    input.expectedPayout,
    input.actualPayout,
    input.attendanceDeductionsTotal,
    teamAdvances,
    otherDeductions,
  );
  return {
    expectedPayout: input.expectedPayout,
    actualPayout,
    attendanceDeductionsTotal: input.attendanceDeductionsTotal,
    lateDeductionsTotal: input.lateDeductionsTotal ?? 0,
    absenceDeductionsTotal: input.absenceDeductionsTotal ?? 0,
    teamAdvancesTotal: teamAdvances,
    otherDeductionsTotal: otherDeductions,
    teamAdvanceItems: input.teamAdvanceItems,
  };
}
