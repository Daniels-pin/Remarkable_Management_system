/** Canonical net payout: expected minus attendance penalties (and future deductions). */

export function resolveActualPayout(
  expectedPayout: number,
  actualPayout: number | undefined | null,
  attendanceDeductionsTotal: number,
): number {
  if (attendanceDeductionsTotal > 0) {
    return Math.max(0, expectedPayout - attendanceDeductionsTotal);
  }
  return actualPayout ?? expectedPayout;
}

export function normalizePayoutBreakdown(input: {
  expectedPayout: number;
  actualPayout?: number | null;
  attendanceDeductionsTotal: number;
  lateDeductionsTotal?: number;
  absenceDeductionsTotal?: number;
}) {
  const actualPayout = resolveActualPayout(
    input.expectedPayout,
    input.actualPayout,
    input.attendanceDeductionsTotal,
  );
  return {
    expectedPayout: input.expectedPayout,
    actualPayout,
    attendanceDeductionsTotal: input.attendanceDeductionsTotal,
    lateDeductionsTotal: input.lateDeductionsTotal ?? 0,
    absenceDeductionsTotal: input.absenceDeductionsTotal ?? 0,
  };
}
