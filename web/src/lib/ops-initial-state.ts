import type { SessionInfo } from "@/lib/api";
import type {
  ActivityItem,
  ApprovalItem,
  BarberProfile,
  FinancialSnapshot,
  LedgerTransaction,
  MonthFinanceCard,
  OpsNotification,
  PayoutRow,
  ReconciliationAlert,
} from "@/lib/ops-types";

/** Canonical zero snapshot until ledger-backed aggregates exist. */
export const EMPTY_FINANCIAL_SNAPSHOT: FinancialSnapshot = {
  totalRevenue: 0,
  servicesRevenue: 0,
  serviceExpenses: 0,
  serviceNetProfit: 0,
  productSalesRevenue: 0,
  productCost: 0,
  productProfit: 0,
  inventoryValue: 0,
  lowStockCount: 0,
  totalExpenses: 0,
  operationalExpenses: 0,
  rentExpenses: 0,
  payrollCommission: 0,
  netProfit: 0,
  totalBusinessNetProfit: 0,
  expenseSources: {
    shopCash: 0,
    adminTransfer: 0,
    total: 0,
    operationalShopCash: 0,
    operationalAdminTransfer: 0,
    operationalTotal: 0,
  },
  paymentMethods: {
    cash: 0,
    card: 0,
    transfer: 0,
    pos: 0,
  },
};

export function scaleFinancials(
  base: FinancialSnapshot,
  factor: number,
): FinancialSnapshot {
  const round = (n: number) => Math.round(n * factor);
  return {
    totalRevenue: round(base.totalRevenue),
    servicesRevenue: round(base.servicesRevenue),
    serviceExpenses: round(base.serviceExpenses),
    serviceNetProfit: round(base.serviceNetProfit),
    productSalesRevenue: round(base.productSalesRevenue),
    productCost: round(base.productCost),
    productProfit: round(base.productProfit),
    inventoryValue: round(base.inventoryValue),
    lowStockCount: base.lowStockCount,
    totalExpenses: round(base.totalExpenses),
    operationalExpenses: round(base.operationalExpenses),
    rentExpenses: round(base.rentExpenses),
    payrollCommission: round(base.payrollCommission),
    netProfit: round(base.netProfit),
    totalBusinessNetProfit: round(base.totalBusinessNetProfit),
    expenseSources: {
      shopCash: round(base.expenseSources.shopCash),
      adminTransfer: round(base.expenseSources.adminTransfer),
      total: round(base.expenseSources.total),
      operationalShopCash: round(base.expenseSources.operationalShopCash),
      operationalAdminTransfer: round(base.expenseSources.operationalAdminTransfer),
      operationalTotal: round(base.expenseSources.operationalTotal),
    },
    paymentMethods: {
      cash: round(base.paymentMethods.cash),
      card: round(base.paymentMethods.card),
      transfer: round(base.paymentMethods.transfer),
      pos: round(base.paymentMethods.pos),
    },
  };
}

export function rangeFactor(
  preset: "today" | "week" | "month" | "year" | "all" | "custom",
  customDays?: number,
): number {
  switch (preset) {
    case "today":
      return 1 / 26;
    case "week":
      return 0.24;
    case "month":
      return 1;
    case "year":
      return 11.2;
    case "all":
      return 52;
    default: {
      const d = customDays ?? 30;
      return Math.max(0.05, d / 30);
    }
  }
}

export const INITIAL_ACTIVITY: ActivityItem[] = [];
export const INITIAL_MANAGER_LOGS: ActivityItem[] = [];
export const INITIAL_APPROVALS: ApprovalItem[] = [];
export const INITIAL_RECONCILIATION_ALERTS: ReconciliationAlert[] = [];
export const INITIAL_TRANSACTIONS: LedgerTransaction[] = [];
export const INITIAL_BARBERS: BarberProfile[] = [];
export const INITIAL_MONTH_FINANCE: MonthFinanceCard[] = [];
export const INITIAL_PAYOUT_HISTORY: PayoutRow[] = [];
export const INITIAL_NOTIFICATIONS: OpsNotification[] = [];

function initialsFromUserId(userId: string): string {
  const hex = userId.replace(/-/g, "");
  return hex.slice(0, 2).toUpperCase() || "ME";
}

/** Placeholder profile with no financial claims; replace when directory API is wired. */
export function createEmptyBarberProfileForSession(session: SessionInfo): BarberProfile {
  return {
    id: session.user_id,
    displayName: "Your profile",
    initials: initialsFromUserId(session.user_id),
    email: "Not linked to directory yet",
    phone: "—",
    bankName: "Not on file",
    accountNumber: "—",
    accountName: "—",
    commissionPct: 0,
    salaryType: "commission",
    avatarUrl: null,
    monthStats: { revenue: 0, services: 0, payout: 0 },
    allTimeStats: { revenue: 0, services: 0, payout: 0 },
  };
}
