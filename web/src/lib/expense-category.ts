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

const RENT_CATEGORY_NAMES = new Set(["rent", "lease", "shop rent", "property rent"]);

/** Expense categories that represent rent or lease (owner-level; hidden from managers). */
export function isRentExpenseCategory(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = name.trim().toLowerCase();
  if (RENT_CATEGORY_NAMES.has(normalized)) return true;
  return normalized.includes("rent") || normalized.includes("lease");
}

export function isPayrollExpenseCategory(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = name.trim().toLowerCase();
  if (PAYROLL_CATEGORY_NAMES.has(normalized)) return true;
  return PAYROLL_TOKENS.some((token) => normalized.includes(token));
}

/** Manager-visible operational spend only (excludes rent and payroll). */
export function isManagerOperationalExpenseCategory(name: string | null | undefined): boolean {
  return !isPayrollExpenseCategory(name) && !isRentExpenseCategory(name);
}
