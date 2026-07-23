import type { FinancialMonthRow } from "@/lib/api";

export type RevenuePaymentMethods = {
  cash: number;
  transfer: number;
  pos: number;
};

export type FinancialMonthMetrics = {
  totalRevenue: number | null;
  revenuePaymentMethods: RevenuePaymentMethods | null;
  serviceRevenue: number | null;
  inventoryRevenue: number | null;
  serviceNetProfit: number | null;
  inventoryProfit: number | null;
  businessNetProfit: number | null;
  operationalExpenses: number | null;
  shopExpenses: number | null;
  inventoryValue: number | null;
  rentExpenses: number | null;
  payrollCommission: number | null;
  commissionTotal: number | null;
  salaryTotal: number | null;
  teamAdvancesTotal: number | null;
  personalConsumptionTotal: number | null;
  monthCashMovement: number | null;
  monthCashMovementBreakdown: {
    cashServices: number;
    cashProductSales: number;
    cashExpenses: number;
    cashTeamAdvances: number;
  } | null;
};

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapField(
  row: FinancialMonthRow,
  key: string,
): number | null {
  const top = (row as Record<string, unknown>)[key];
  if (top != null && top !== "") return num(top);
  const snap = row.snapshot as Record<string, unknown> | null | undefined;
  if (snap?.[key] != null && snap[key] !== "") return num(snap[key]);
  return null;
}

function extractRevenuePaymentMethods(
  row: FinancialMonthRow,
): RevenuePaymentMethods | null {
  const raw =
    row.payment_methods ??
    (row.snapshot as { payment_methods?: Record<string, string> } | null | undefined)
      ?.payment_methods;
  if (!raw || typeof raw !== "object") return null;
  return {
    cash: num(raw.cash) ?? 0,
    transfer: num(raw.transfer) ?? 0,
    pos: num(raw.pos) ?? 0,
  };
}

function extractMonthCashMovement(row: FinancialMonthRow): {
  monthCashMovement: number | null;
  monthCashMovementBreakdown: FinancialMonthMetrics["monthCashMovementBreakdown"];
} {
  const topNet = num(row.month_cash_movement);
  const snap = row.snapshot as
    | {
        month_cash_movement?: string;
        month_cash_movement_breakdown?: Record<string, string>;
      }
    | null
    | undefined;
  const net = topNet ?? num(snap?.month_cash_movement);

  const raw =
    row.month_cash_movement_breakdown ??
    snap?.month_cash_movement_breakdown ??
    null;
  if (!raw || typeof raw !== "object") {
    return { monthCashMovement: net, monthCashMovementBreakdown: null };
  }
  return {
    monthCashMovement: net,
    monthCashMovementBreakdown: {
      cashServices: num(raw.cash_services) ?? 0,
      cashProductSales: num(raw.cash_product_sales) ?? 0,
      cashExpenses: num(raw.cash_expenses) ?? 0,
      cashTeamAdvances: num(raw.cash_team_advances) ?? 0,
    },
  };
}

export function extractFinancialMonthMetrics(
  row: FinancialMonthRow,
  extras?: { commissionTotal?: number | null; salaryTotal?: number | null },
): FinancialMonthMetrics {
  const serviceNetProfit = snapField(row, "service_net_profit");
  const inventoryProfit = snapField(row, "product_profit");
  const computedBusinessNet =
    serviceNetProfit != null && inventoryProfit != null
      ? serviceNetProfit + inventoryProfit
      : null;

  const operationalExpenses =
    num(row.operational_expenses) ??
    num(row.expense_sources?.operational_total) ??
    snapField(row, "operational_expenses");

  const cashMovement = extractMonthCashMovement(row);

  return {
    totalRevenue: num(row.total_revenue) ?? snapField(row, "total_revenue"),
    revenuePaymentMethods: extractRevenuePaymentMethods(row),
    serviceRevenue: snapField(row, "services_revenue"),
    inventoryRevenue: snapField(row, "product_sales_revenue"),
    serviceNetProfit,
    inventoryProfit,
    businessNetProfit:
      snapField(row, "total_business_net_profit") ??
      num(row.net_profit) ??
      snapField(row, "net_profit") ??
      computedBusinessNet,
    operationalExpenses,
    shopExpenses: operationalExpenses,
    inventoryValue: snapField(row, "inventory_value"),
    rentExpenses: num(row.rent_expenses) ?? snapField(row, "rent_expenses"),
    payrollCommission: num(row.payroll_commission) ?? snapField(row, "payroll_commission"),
    commissionTotal: extras?.commissionTotal ?? null,
    salaryTotal: extras?.salaryTotal ?? null,
    teamAdvancesTotal: num(row.total_team_advances) ?? snapField(row, "total_team_advances"),
    personalConsumptionTotal:
      num(row.total_personal_consumption) ?? snapField(row, "total_personal_consumption"),
    monthCashMovement: cashMovement.monthCashMovement,
    monthCashMovementBreakdown: cashMovement.monthCashMovementBreakdown,
  };
}
