import type { LedgerEntryType } from "@/lib/ops-types";

const MONTH_ABBREVS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/** Compact month tag for display indexes, e.g. JUN26, JAN27. */
export function financialMonthPrefix(year: number, month: number): string {
  if (month < 1 || month > 12) return "";
  return `${MONTH_ABBREVS[month - 1]}${String(year % 100).padStart(2, "0")}`;
}

/** Display label: JUN26-001 (services), S-JUN26-001 (sales), E-JUN26-001 (expenses). */
export function formatLedgerIndexLabel(
  entryType: LedgerEntryType,
  index: number | null | undefined,
  indexLabel?: string | null,
  year?: number | null,
  month?: number | null,
): string {
  if (indexLabel) return indexLabel;
  if (index == null || index <= 0) return "—";

  const monthTag =
    year != null && month != null ? `${financialMonthPrefix(year, month)}-` : "";
  const seq = String(index).padStart(3, "0");

  if (entryType === "sale") return `S-${monthTag}${seq}`;
  if (entryType === "expense") return `E-${monthTag}${seq}`;
  return `${monthTag}${seq}`;
}
