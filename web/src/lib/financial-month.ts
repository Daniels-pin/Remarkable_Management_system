export type FinancialMonthState = "open" | "grace_period" | "locked";

/** Normalize legacy API values to the current lifecycle vocabulary. */
export function normalizeFinancialMonthState(state: string): FinancialMonthState {
  if (state === "grace_period" || state === "closed") return "grace_period";
  if (state === "locked" || state === "paid_locked") return "locked";
  return "open";
}

export function financialMonthStatusLabel(state: string): string {
  const normalized = normalizeFinancialMonthState(state);
  if (normalized === "open") return "Open";
  if (normalized === "grace_period") return "Grace period";
  return "Locked";
}

export function financialMonthStatusTone(state: string): string {
  const normalized = normalizeFinancialMonthState(state);
  if (normalized === "open") {
    return "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200";
  }
  if (normalized === "grace_period") {
    return "bg-amber-500/12 text-amber-900 dark:text-amber-200";
  }
  return "bg-[var(--muted)]/60 text-[var(--muted-foreground)]";
}

export function isGracePeriodEditable(state: string | undefined | null): boolean {
  return normalizeFinancialMonthState(state ?? "locked") === "grace_period";
}

export function monthLabel(year: number, month: number) {
  return new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}
