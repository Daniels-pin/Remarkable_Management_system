/** Calendar month helpers for operational ledger history. */

export type YearMonth = { year: number; month: number };

export function currentYearMonth(now = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function shiftYearMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function yearMonthKey({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function yearMonthEquals(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

export function monthDisplayLabel({ year, month }: YearMonth): string {
  return new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

export function quickMonthPresets(now = new Date()): { id: string; label: string; value: YearMonth }[] {
  const cur = currentYearMonth(now);
  const twoAgo = shiftYearMonth(cur, -2);
  const prev = shiftYearMonth(cur, -1);
  return [
    { id: yearMonthKey(cur), label: "This month", value: cur },
    { id: yearMonthKey(prev), label: "Last month", value: prev },
    { id: yearMonthKey(twoAgo), label: "Two months ago", value: twoAgo },
  ];
}
