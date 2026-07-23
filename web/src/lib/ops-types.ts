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
export type ExpensePaymentSource = "cash_shop" | "admin_transfer";
export type LedgerPaymentMethod = PaymentMethod | ExpensePaymentSource;

export type PaymentMethodAdjustment = {
  id: string;
  original_method: "cash" | "transfer" | "pos";
  new_method: "cash" | "transfer" | "pos";
  corrected_by_user_id: string;
  corrected_by_label: string | null;
  reason: string;
  created_at: string;
};

export type LedgerTransaction = {
  id: string;
  index: number;
  type: LedgerEntryType;
  employeeName: string | null;
  employeeId: string | null;
  amount: number;
  previousAmount?: number;
  paymentMethod: LedgerPaymentMethod | null;
  note: string | null;
  status: TransactionStatus;
  createdAt: string;
  businessDate?: string | null;
  reconciledAt?: string | null;
  approvedAt?: string | null;
  serviceType?: string;
  saleCategory?: string;
  expenseCategory?: string;
  reconciliation?: {
    originalAmount: number;
    approvedAmount: number;
    history: { at: string; label: string; amount: number }[];
  };
  comparisonStatus?: string;
  indexLabel?: string;
  recordLifecycle?: "active" | "deleted" | "purged";
  isVoided?: boolean;
  voidReason?: string | null;
  voidedByLabel?: string | null;
  voidedAt?: string | null;
  pendingVoidReason?: string | null;
  pendingVoidByLabel?: string | null;
  canEdit?: boolean;
  canVoid?: boolean;
  paymentMethodAdjustments?: PaymentMethodAdjustment[];
  productSale?: {
    productName: string;
    quantity: number;
    recordedByLabel: string | null;
    unitSellingPrice: number;
    revenue: number;
  };
};

export type ExpenseSourceBreakdown = {
  shopCash: number;
  adminTransfer: number;
  total: number;
  operationalShopCash: number;
  operationalAdminTransfer: number;
  operationalTotal: number;
};

export type CashAtHandBreakdown = {
  cashServices: number;
  cashProductSales: number;
  cashExpenses: number;
  cashTeamAdvances: number;
};

export type FinancialSnapshot = {
  totalRevenue: number;
  servicesRevenue: number;
  serviceExpenses: number;
  serviceNetProfit: number;
  productSalesRevenue: number;
  productCost: number;
  productProfit: number;
  personalConsumptionCost: number;
  inventoryValue: number;
  lowStockCount: number;
  totalExpenses: number;
  operationalExpenses: number;
  rentExpenses: number;
  payrollCommission: number;
  netProfit: number;
  totalBusinessNetProfit: number;
  expenseSources: ExpenseSourceBreakdown;
  paymentMethods: Record<PaymentMethod, number>;
  cashAtHand: number;
  cashAtHandBreakdown: CashAtHandBreakdown;
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
  salaryType: string;
  avatarUrl: string | null;
  monthStats: {
    revenue: number;
    services: number;
    payout: number;
    approved?: number;
    pending?: number;
  };
  allTimeStats: { revenue: number; services: number; payout: number; approved?: number };
};

export type TeamMemberProfile = BarberProfile & {
  role: "manager" | "barber" | "staff";
  fixedSalary: number | null;
};

export type PayoutRow = {
  id: string;
  periodLabel: string;
  amount: number;
  status: "paid" | "pending";
  paidAt: string | null;
};

export type NotificationKind = "approval" | "reconciliation" | "dispute" | "inventory";

export type OpsNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  relatedTransactionId?: string;
  relatedProductId?: string;
};
