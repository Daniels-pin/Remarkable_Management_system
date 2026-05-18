/** Expense categories that represent payroll / payout accounting (admin-only visibility). */
const PAYROLL_CATEGORY_NAMES = new Set([
  "salary",
  "commission",
  "commissions",
  "payroll",
  "wages",
  "barber payout",
  "staff payout",
]);

const PAYROLL_TOKENS = ["salary", "commission", "payroll", "payout"] as const;

export function isPayrollExpenseCategory(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = name.trim().toLowerCase();
  if (PAYROLL_CATEGORY_NAMES.has(normalized)) return true;
  return PAYROLL_TOKENS.some((token) => normalized.includes(token));
}
