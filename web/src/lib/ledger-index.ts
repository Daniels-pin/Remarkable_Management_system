import type { LedgerEntryType } from "@/lib/ops-types";

/** Display label for ledger index: #001 (services), S-001 (sales), E-001 (expenses). */
export function formatLedgerIndexLabel(
  entryType: LedgerEntryType,
  index: number | null | undefined,
  indexLabel?: string | null,
): string {
  if (indexLabel) return indexLabel;
  if (index == null || index <= 0) {
    if (entryType === "sale" || entryType === "expense") return "—";
    return "—";
  }
  if (entryType === "sale") return `S-${String(index).padStart(3, "0")}`;
  if (entryType === "expense") return `E-${String(index).padStart(3, "0")}`;
  return `#${String(index).padStart(3, "0")}`;
}
