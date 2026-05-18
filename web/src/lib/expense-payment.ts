/** Expense funding source for manager/admin operational spend. */
export type ExpensePaymentSource = "cash_shop" | "admin_transfer";

export const EXPENSE_PAYMENT_SOURCES: {
  value: ExpensePaymentSource;
  label: string;
  description: string;
}[] = [
  {
    value: "cash_shop",
    label: "Cash (Shop)",
    description: "Paid from shop operational cash",
  },
  {
    value: "admin_transfer",
    label: "Transfer (Admin)",
    description: "Personally covered by admin via transfer or personal funds",
  },
];

export function formatExpensePaymentSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw === "cash_shop" || raw === "cash") return "Cash (Shop)";
  if (raw === "admin_transfer" || raw === "transfer") return "Transfer (Admin)";
  return null;
}

export function normalizeExpensePaymentSource(
  raw: string | null | undefined,
): ExpensePaymentSource | null {
  if (!raw) return null;
  if (raw === "cash_shop" || raw === "cash") return "cash_shop";
  if (raw === "admin_transfer" || raw === "transfer") return "admin_transfer";
  return null;
}
