import type { OperationsSummaryResponse } from "@/lib/api";
import type { FinancialSnapshot } from "@/lib/ops-types";

export function mapOperationsSummary(raw: OperationsSummaryResponse): FinancialSnapshot {
  const num = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    totalRevenue: num(raw.total_revenue),
    servicesRevenue: num(raw.services_revenue),
    productSalesRevenue: num(raw.product_sales_revenue),
    totalExpenses: num(raw.total_expenses),
    operationalExpenses: num(raw.operational_expenses),
    rentExpenses: num(raw.rent_expenses ?? "0"),
    payrollCommission: num(raw.payroll_commission),
    netProfit: num(raw.net_profit),
    expenseSources: {
      shopCash: num(raw.expense_sources.shop_cash),
      adminTransfer: num(raw.expense_sources.admin_transfer),
      total: num(raw.expense_sources.total),
      operationalShopCash: num(raw.expense_sources.operational_shop_cash ?? raw.expense_sources.shop_cash),
      operationalAdminTransfer: num(
        raw.expense_sources.operational_admin_transfer ?? raw.expense_sources.admin_transfer,
      ),
      operationalTotal: num(raw.expense_sources.operational_total ?? raw.operational_expenses),
    },
    paymentMethods: {
      cash: num(raw.payment_methods.cash ?? "0"),
      card: num(raw.payment_methods.card ?? "0"),
      transfer: num(raw.payment_methods.transfer ?? "0"),
      pos: num(raw.payment_methods.pos ?? "0"),
    },
  };
}
