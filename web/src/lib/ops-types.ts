export type LedgerEntryType = "service" | "sale" | "expense";

export type TransactionStatus =
  | "pending"
  | "approved"
  | "adjusted"
  | "awaiting_review"
  | "settled"
  | "disputed"
  | "locked";

export type PaymentMethod = "cash" | "card" | "transfer" | "pos";

export type LedgerTransaction = {
  id: string;
  index: number;
  type: LedgerEntryType;
  employeeName: string | null;
  employeeId: string | null;
  amount: number;
  previousAmount?: number;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  status: TransactionStatus;
  createdAt: string;
  serviceType?: string;
  saleCategory?: string;
  expenseCategory?: string;
  reconciliation?: {
    originalAmount: number;
    approvedAmount: number;
    history: { at: string; label: string; amount: number }[];
  };
};

export type FinancialSnapshot = {
  totalRevenue: number;
  servicesRevenue: number;
  productSalesRevenue: number;
  totalExpenses: number;
  operationalExpenses: number;
  payrollCommission: number;
  netProfit: number;
  paymentMethods: Record<PaymentMethod, number>;
};

export type ActivityItem = {
  id: string;
  label: string;
  detail: string;
  at: string;
  tone?: "default" | "warning" | "success";
};

export type ApprovalItem = {
  id: string;
  title: string;
  meta: string;
  at: string;
};

export type ReconciliationAlert = {
  id: string;
  title: string;
  detail: string;
  amountDelta: number;
  at: string;
};

export type MonthFinanceCard = {
  id: string;
  year: number;
  month: number;
  revenue: number;
  expenses: number;
  profit: number;
  payoutStatus: "scheduled" | "paid" | "held";
  locked: boolean;
};

export type BarberProfile = {
  id: string;
  displayName: string;
  initials: string;
  email: string;
  phone: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  commissionPct: number;
  salaryType: "commission" | "base_plus_commission";
  avatarUrl: string | null;
  monthStats: { revenue: number; services: number; product: number; payout: number };
  allTimeStats: { revenue: number; services: number; product: number; payout: number };
};

export type PayoutRow = {
  id: string;
  periodLabel: string;
  amount: number;
  status: "paid" | "pending";
  paidAt: string | null;
};

export type NotificationKind = "approval" | "reconciliation" | "dispute";

export type OpsNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  relatedTransactionId?: string;
};
