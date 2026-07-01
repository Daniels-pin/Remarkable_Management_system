/** Browser calls same-origin `/api/*` (proxied by Next.js). SSR uses direct URL. */
function apiBase(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  const target =
    process.env.API_PROXY_TARGET ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8000";
  return target.replace(/\/$/, "");
}

const base = apiBase;

export type UserRole = "admin" | "manager" | "barber" | "staff";

export type SessionInfo = {
  user_id: string;
  role: UserRole;
  must_change_password: boolean;
  expires_at: string;
  seconds_until_expiry: number;
  impersonating: boolean;
  impersonator_user_id: string | null;
};

type ApiErrorBody = { message?: string; code?: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Session/auth 401s are handled globally — skip user-facing toasts. */
  readonly skipUserNotification: boolean;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.skipUserNotification =
      status === 401 &&
      (code === "NO_SESSION" || code === "SESSION_INVALID" || code === "ACCOUNT_INACTIVE");
  }
}

export class NetworkError extends Error {
  constructor(message = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}

export function isSessionAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.skipUserNotification;
}

const SESSION_INVALID_EVENT = "remarkable:session-invalid";

function notifySessionInvalid() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_INVALID_EVENT));
  }
}

export { SESSION_INVALID_EVENT };

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${base()}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new NetworkError();
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const body = json as ApiErrorBody | Record<string, unknown> | null;
    let msg = `Request failed (${res.status})`;
    let code: string | undefined;
    if (body && typeof body === "object") {
      const top = body as ApiErrorBody;
      if (typeof top.message === "string") {
        msg = top.message;
        code = top.code;
      } else if ("detail" in body && body.detail && typeof body.detail === "object") {
        const d = body.detail as { message?: string; code?: string };
        if (typeof d.message === "string") msg = d.message;
        if (typeof d.code === "string") code = d.code;
      }
    }
    const err = new ApiError(res.status, msg, code);
    if (err.skipUserNotification) {
      notifySessionInvalid();
    }
    throw err;
  }

  return json as T;
}

export function getSession() {
  return apiFetch<SessionInfo>("/api/v1/auth/session");
}

export function login(username_or_email: string, password: string) {
  return apiFetch<SessionInfo>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ username_or_email, password }),
  });
}

export function logout() {
  return apiFetch<{ message: string }>("/api/v1/auth/logout", {
    method: "POST",
  });
}

export function changePassword(current_password: string, new_password: string) {
  return apiFetch<{ message: string }>("/api/v1/auth/password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
}

export type AccountStatus = "active" | "disabled" | "deleted";
export type SalaryType = "fixed" | "commission" | "fixed_or_commission" | null;

export type AdminUserRow = {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  account_status: AccountStatus;
  salary_type: SalaryType;
  commission_pct: string | number | null;
  fixed_salary: string | number | null;
  avatar_seed: string | null;
  must_change_password: boolean;
  profile: { full_name: string | null } | null;
  last_active_at: string | null;
  created_at: string | null;
};

export type AdminUserDetail = AdminUserRow & {
  updated_at: string | null;
};

export function listAdminUsers() {
  return apiFetch<{ items: AdminUserRow[] }>("/api/v1/admin/users");
}

export function getAdminUser(id: string) {
  return apiFetch<AdminUserDetail>(`/api/v1/admin/users/${id}`);
}

export function createAdminUser(body: Record<string, unknown>) {
  return apiFetch<AdminUserDetail>("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchAdminUser(id: string, body: Record<string, unknown>) {
  return apiFetch<AdminUserDetail>(`/api/v1/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deactivateAdminUser(id: string) {
  return apiFetch<AdminUserDetail>(`/api/v1/admin/users/${id}/deactivate`, {
    method: "POST",
  });
}

export function reactivateAdminUser(id: string) {
  return apiFetch<AdminUserDetail>(`/api/v1/admin/users/${id}/reactivate`, {
    method: "POST",
  });
}

export function purgeAdminUser(id: string) {
  return apiFetch<{ message: string }>(`/api/v1/admin/users/${id}/purge`, {
    method: "POST",
  });
}

export function resetAdminUserPassword(id: string) {
  return apiFetch<{ temporary_password: string; message: string }>(
    `/api/v1/admin/users/${id}/reset-password`,
    { method: "POST" },
  );
}

export function impersonateUser(id: string) {
  return apiFetch<SessionInfo>(`/api/v1/admin/users/${id}/impersonate`, {
    method: "POST",
  });
}

export function stopImpersonation() {
  return apiFetch<SessionInfo>("/api/v1/admin/impersonation/stop", {
    method: "POST",
  });
}

export type ExpenseSourcesRow = {
  shop_cash: string;
  admin_transfer: string;
  total: string;
  operational_shop_cash?: string;
  operational_admin_transfer?: string;
  operational_total?: string;
  rent_shop_cash?: string;
  rent_admin_transfer?: string;
};

export type FinancialMonthState = "open" | "grace_period" | "locked";

export type AttendanceDeductionItem = {
  business_date: string;
  status: string;
  deduction_amount: string;
  deduction_reason: string | null;
  signed_in_at: string | null;
};

export type FinancialMonthRow = {
  id: string;
  year: number;
  month: number;
  state: FinancialMonthState | string;
  is_current?: boolean;
  closed_at: string | null;
  grace_ends_at?: string | null;
  locked_at?: string | null;
  total_revenue?: string;
  total_expenses?: string;
  operational_expenses?: string;
  rent_expenses?: string;
  payroll_commission?: string;
  net_profit?: string | null;
  expense_sources?: ExpenseSourcesRow;
  snapshot?: Record<string, unknown> | null;
  /** Personal earnings (barber/staff) */
  approved_total?: string;
  earnings_amount?: string;
  commission_pct_at_close?: string | null;
  statement_id?: string | null;
  payout_state?: string;
  payout_payment_date?: string | null;
  payout_paid_by_label?: string | null;
  payout_note?: string | null;
  attendance_deductions_total?: string;
  attendance_late_deductions_total?: string;
  attendance_absence_deductions_total?: string;
  attendance_deduction_items?: AttendanceDeductionItem[];
  net_earnings_amount?: string;
  /** Month summary fields (admin/manager archive) */
  services_revenue?: string;
  product_sales_revenue?: string;
  service_net_profit?: string;
  product_profit?: string;
  total_business_net_profit?: string;
  inventory_value?: string;
};

export type OperationsSummaryResponse = {
  total_revenue: string;
  services_revenue: string;
  service_expenses?: string;
  service_net_profit?: string;
  product_sales_revenue: string;
  product_cost?: string;
  product_profit?: string;
  inventory_value?: string;
  low_stock_count?: number;
  total_expenses: string;
  operational_expenses: string;
  rent_expenses?: string;
  payroll_commission: string;
  net_profit: string;
  total_business_net_profit?: string;
  expense_sources: ExpenseSourcesRow;
  payment_methods: Record<string, string>;
};

export type InventoryCategoryItem = {
  id: string;
  name: string;
  status: CategoryStatus;
  is_active: boolean;
  sort_order: number;
};

export type InventoryProductItem = {
  id: string;
  category_id: string;
  category_name: string | null;
  name: string;
  cost_price: string;
  default_selling_price: string;
  stock_quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
  status: CategoryStatus;
  is_active: boolean;
  is_low_stock: boolean;
  inventory_value: string;
  sort_order: number;
};

export type InventoryProductDetail = InventoryProductItem & {
  revenue_generated: string;
  cost_generated: string;
  profit_generated: string;
  units_sold: number;
  stock_movements: InventoryStockMovementItem[];
  sales_history: InventoryProductSaleHistoryItem[];
};

export type InventoryProductSaleHistoryItem = {
  id: string;
  product_name: string | null;
  quantity: number;
  revenue: string;
  profit: string;
  recorded_by_user_id: string | null;
  recorded_by_label: string | null;
  occurred_at: string | null;
};

export type InventoryStockMovementItem = {
  id: string;
  product_id: string;
  product_name?: string | null;
  movement_type: string;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  unit_cost: string | null;
  note: string | null;
  created_at: string | null;
};

export type ProductSaleLedgerMeta = {
  id: string;
  product_id: string;
  product_name: string | null;
  category_name: string | null;
  quantity: number;
  unit_cost_price: string;
  unit_selling_price: string;
  revenue: string;
  cost: string;
  profit: string;
  recorded_by_user_id: string | null;
  recorded_by_label: string | null;
};

export function listInventoryCategories(options?: { includeInactive?: boolean }) {
  const qs = options?.includeInactive ? "?include_inactive=true" : "";
  return apiFetch<{ items: InventoryCategoryItem[] }>(
    `/api/v1/barbershop/inventory/categories${qs}`,
  );
}

export function createInventoryCategory(body: { name: string; status?: CategoryStatus }) {
  return apiFetch<InventoryCategoryItem>("/api/v1/barbershop/inventory/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateInventoryCategory(
  id: string,
  body: { name?: string; status?: CategoryStatus },
) {
  return apiFetch<InventoryCategoryItem>(`/api/v1/barbershop/inventory/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listInventoryProducts(options?: {
  categoryId?: string;
  includeInactive?: boolean;
}) {
  const qs = new URLSearchParams();
  if (options?.categoryId) qs.set("category_id", options.categoryId);
  if (options?.includeInactive) qs.set("include_inactive", "true");
  const q = qs.toString();
  return apiFetch<{ items: InventoryProductItem[] }>(
    `/api/v1/barbershop/inventory/products${q ? `?${q}` : ""}`,
  );
}

export function getInventoryProduct(id: string) {
  return apiFetch<InventoryProductDetail>(`/api/v1/barbershop/inventory/products/${id}`);
}

export function createInventoryProduct(body: {
  category_id: string;
  name: string;
  cost_price: number;
  default_selling_price: number;
  opening_stock?: number;
  low_stock_threshold?: number;
  image_url?: string | null;
}) {
  return apiFetch<InventoryProductItem>("/api/v1/barbershop/inventory/products", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateInventoryProduct(
  id: string,
  body: Partial<{
    category_id: string;
    name: string;
    cost_price: number;
    default_selling_price: number;
    low_stock_threshold: number;
    image_url: string | null;
    status: CategoryStatus;
  }>,
) {
  return apiFetch<InventoryProductItem>(`/api/v1/barbershop/inventory/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function stockInInventoryProduct(
  id: string,
  body: { quantity: number; note?: string | null },
) {
  return apiFetch<{ movement: InventoryStockMovementItem; product: InventoryProductItem }>(
    `/api/v1/barbershop/inventory/products/${id}/stock-in`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function adjustInventoryStock(
  id: string,
  body: { quantity_delta: number; note?: string | null },
) {
  return apiFetch<{ movement: InventoryStockMovementItem; product: InventoryProductItem }>(
    `/api/v1/barbershop/inventory/products/${id}/adjust`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function recordInventoryProductSale(body: Record<string, unknown>) {
  return apiFetch<{
    ledger_entry_id: string;
    index_label: string | null;
    amount: string;
    product_sale: ProductSaleLedgerMeta;
  }>("/api/v1/barbershop/inventory/sales", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listLowStockProducts() {
  return apiFetch<{ items: InventoryProductItem[] }>("/api/v1/barbershop/inventory/low-stock");
}

export function getInventorySummary(params?: {
  preset?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.preset) qs.set("preset", params.preset);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const q = qs.toString();
  return apiFetch<{
    inventory_value: string;
    period: { product_revenue: string; product_cost: string; product_profit: string };
    all_time?: { product_revenue: string; product_cost: string; product_profit: string };
    low_stock_count: number;
  }>(`/api/v1/barbershop/inventory/summary${q ? `?${q}` : ""}`);
}

export type InventoryRecorderSalesRow = {
  recorded_by_user_id: string;
  recorded_by_label: string | null;
  revenue: string;
  cost: string;
  profit: string;
  units_sold: number;
};

/** @deprecated Use InventoryRecorderSalesRow */
export type InventoryEmployeeSalesRow = InventoryRecorderSalesRow;

export function getInventorySalesByRecorder(params?: {
  preset?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.preset) qs.set("preset", params.preset);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const q = qs.toString();
  return apiFetch<{ items: InventoryRecorderSalesRow[] }>(
    `/api/v1/barbershop/inventory/analytics/by-recorder${q ? `?${q}` : ""}`,
  );
}

export function getInventorySalesByEmployee(params?: {
  preset?: string;
  from?: string;
  to?: string;
}) {
  return getInventorySalesByRecorder(params);
}

export function listFinancialMonths() {
  return apiFetch<{ items: FinancialMonthRow[]; note?: string }>("/api/v1/finance/months");
}

export function getCurrentFinancialMonth() {
  return apiFetch<{ month: FinancialMonthRow | null }>("/api/v1/finance/months/current");
}

export function closeFinancialMonth(id: string, body?: { note?: string | null }) {
  return apiFetch<FinancialMonthRow>(`/api/v1/finance/months/${id}/close`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function reopenFinancialMonth(id: string, reason: string) {
  return apiFetch<{ id: string; year: number; month: number; state: string }>(
    `/api/v1/admin/financial-months/${id}/reopen`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
}

export type MeResponse = {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  account_status: AccountStatus;
  must_change_password: boolean;
  avatar_seed: string | null;
  salary_type: SalaryType;
  commission_pct: string | null;
  fixed_salary: string | null;
  profile: {
    full_name: string | null;
    address: string | null;
    phone: string | null;
    bank_name: string | null;
    account_number: string | null;
    account_name: string | null;
  } | null;
};

export function getMe() {
  return apiFetch<MeResponse>("/api/v1/me");
}

export function patchMyProfile(body: Record<string, unknown>) {
  return apiFetch<MeResponse["profile"]>("/api/v1/me/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type OpsNotificationRow = {
  id: string;
  type:
    | "pending_approvals"
    | "unresolved_mismatch"
    | "reconciliation_review_request"
    | "dispute_requires_manager"
    | "dispute_requires_admin"
    | "low_stock";
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

export function listNotifications() {
  return apiFetch<{ items: OpsNotificationRow[] }>("/api/v1/notifications");
}

export type CatalogItem = { id: string; name: string; is_active: boolean };

export type CategoryStatus = "active" | "disabled" | "archived";

export type ServiceTypeStatus = CategoryStatus;

export type CategoryItem = {
  id: string;
  name: string;
  status: CategoryStatus;
  is_active: boolean;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ServiceTypeItem = {
  id: string;
  name: string;
  status: ServiceTypeStatus;
  is_active: boolean;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export function listServiceTypes(options?: { includeInactive?: boolean }) {
  const qs = options?.includeInactive ? "?include_inactive=true" : "";
  return apiFetch<{ items: ServiceTypeItem[] }>(
    `/api/v1/barbershop/catalog/service-types${qs}`,
  );
}

export function createServiceType(body: { name: string; status?: ServiceTypeStatus }) {
  return apiFetch<ServiceTypeItem>("/api/v1/barbershop/catalog/service-types", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateServiceType(
  id: string,
  body: { name?: string; status?: ServiceTypeStatus },
) {
  return apiFetch<ServiceTypeItem>(`/api/v1/barbershop/catalog/service-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listSaleCategories(options?: { includeInactive?: boolean }) {
  const qs = options?.includeInactive ? "?include_inactive=true" : "";
  return apiFetch<{ items: CategoryItem[] }>(
    `/api/v1/barbershop/catalog/sale-categories${qs}`,
  );
}

export function createSaleCategory(body: { name: string; status?: CategoryStatus }) {
  return apiFetch<CategoryItem>("/api/v1/barbershop/catalog/sale-categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSaleCategory(
  id: string,
  body: { name?: string; status?: CategoryStatus },
) {
  return apiFetch<CategoryItem>(`/api/v1/barbershop/catalog/sale-categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listExpenseCategories(options?: { includeInactive?: boolean }) {
  const qs = options?.includeInactive ? "?include_inactive=true" : "";
  return apiFetch<{ items: CategoryItem[] }>(
    `/api/v1/barbershop/catalog/expense-categories${qs}`,
  );
}

export function createExpenseCategory(body: { name: string; status?: CategoryStatus }) {
  return apiFetch<CategoryItem>("/api/v1/barbershop/catalog/expense-categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateExpenseCategory(
  id: string,
  body: { name?: string; status?: CategoryStatus },
) {
  return apiFetch<CategoryItem>(`/api/v1/barbershop/catalog/expense-categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type DirectoryBarberRow = {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  commission_pct: string | null;
  salary_type: SalaryType;
};

export type ReconciliationPosture = "clear" | "pending" | "approved" | "mismatch";

export type MonthPayoutBreakdown = {
  expected_payout_on_approved: string;
  actual_payout_on_approved: string;
  attendance_deductions_total: string;
  attendance_late_deductions_total?: string;
  attendance_absence_deductions_total?: string;
};

export type DirectoryTeamRow = DirectoryBarberRow & {
  role: "manager" | "barber" | "staff";
  fixed_salary?: string | null;
  current_month_revenue: string;
  current_month_services_count: number;
  expected_payout?: string;
  actual_payout?: string;
  attendance_deductions_total?: string;
  reconciliation_posture: ReconciliationPosture;
};

export function listDirectoryTeam(role?: "manager" | "barber" | "staff") {
  const qs = role ? `?role=${role}` : "";
  return apiFetch<{ items: DirectoryTeamRow[]; year: number; month: number }>(
    `/api/v1/barbershop/directory/team${qs}`,
  );
}

export function listDirectoryBarbers() {
  return apiFetch<{ items: DirectoryBarberRow[] }>("/api/v1/barbershop/directory/barbers");
}

export type LedgerRow = {
  id: string;
  entry_type: "service" | "sale" | "expense";
  occurred_at: string;
  business_date: string | null;
  amount: string;
  payment_method: "cash" | "transfer" | "pos" | "cash_shop" | "admin_transfer" | null;
  note: string | null;
  employee_user_id: string | null;
  employee_label: string | null;
  created_by_user_id: string | null;
  created_by_label: string | null;
  barber_sequence_index: number | null;
  index_label?: string | null;
  reconciliation_status:
    | "pending"
    | "approved"
    | "adjusted"
    | "awaiting_barber_review"
    | "settled"
    | "disputed"
    | "locked"
    | "missing_barber_entry"
    | "manager_override"
    | null;
  original_barber_amount?: string | null;
  manager_approved_amount?: string | null;
  comparison_status?: string | null;
  is_manager_created_without_barber?: boolean;
  service_type: { id: string; name: string } | null;
  sale_category: { id: string; name: string } | null;
  product_sale: ProductSaleLedgerMeta | null;
  expense_category: { id: string; name: string } | null;
  record_lifecycle: "active" | "deleted" | "purged";
  is_voided?: boolean;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by_user_id?: string | null;
  voided_by_label?: string | null;
  pending_void_reason?: string | null;
  pending_void_by_user_id?: string | null;
  pending_void_by_label?: string | null;
  pending_void_requested_at?: string | null;
  original_amount?: string | null;
  approved_at?: string | null;
  reconciled_at?: string | null;
  payment_method_adjustments?: PaymentMethodAdjustmentRow[];
};

export type PendingVoidRequest = {
  entry_id: string;
  index: number;
  index_label: string | null;
  service_name: string;
  amount: string;
  manager_amount: string | null;
  pending_void_reason: string | null;
  pending_void_by_user_id: string | null;
  pending_void_by_label: string | null;
  pending_void_requested_at: string | null;
  business_date: string | null;
};

export function listBarbershopLedger(opts?: {
  businessDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (opts?.businessDate) qs.set("business_date", opts.businessDate);
  if (opts?.page) qs.set("page", String(opts.page));
  if (opts?.pageSize) qs.set("page_size", String(opts.pageSize));
  const q = qs.toString();
  return apiFetch<{
    business_date: string | null;
    page: number;
    page_size: number;
    total: number;
    items: LedgerRow[];
  }>(`/api/v1/barbershop/ledger${q ? `?${q}` : ""}`);
}

export type ReconciliationInboxRow = ReconciliationWorkspaceRow & {
  employee_user_id?: string | null;
  employee_name?: string | null;
  entry_type?: "service";
};

export function listReconciliationInbox(
  filter: "pending" | "mismatch",
  opts?: { page?: number; pageSize?: number },
) {
  const qs = new URLSearchParams({ filter });
  if (opts?.page) qs.set("page", String(opts.page));
  if (opts?.pageSize) qs.set("page_size", String(opts.pageSize));
  return apiFetch<{
    filter: string;
    page: number;
    page_size: number;
    total: number;
    items: ReconciliationInboxRow[];
  }>(`/api/v1/barbershop/ledger/reconciliation-inbox?${qs}`);
}

export function listBarberReconciliationInbox(
  filter: "pending" | "mismatch",
  opts?: { page?: number; pageSize?: number },
) {
  const qs = new URLSearchParams({ filter });
  if (opts?.page) qs.set("page", String(opts.page));
  if (opts?.pageSize) qs.set("page_size", String(opts.pageSize));
  return apiFetch<{
    filter: string;
    page: number;
    page_size: number;
    total: number;
    items: ReconciliationInboxRow[];
  }>(`/api/v1/barber/reconciliation/inbox?${qs}`);
}

export type ReconciliationCounts = {
  pending: number;
  mismatch: number;
};

export function getManagerReconciliationCounts() {
  return apiFetch<ReconciliationCounts>(
    "/api/v1/barbershop/ledger/reconciliation-counts",
  );
}

export function getBarberReconciliationCounts() {
  return apiFetch<ReconciliationCounts>("/api/v1/barber/reconciliation/counts");
}

export function matchPendingLedgerEntry(
  employeeEntryId: string,
  paymentMethod: "cash" | "transfer" | "pos",
) {
  return apiFetch<LedgerRow>(`/api/v1/barbershop/ledger/match/${employeeEntryId}`, {
    method: "POST",
    body: JSON.stringify({ payment_method: paymentMethod }),
  });
}

export function matchAllPendingLedgerEntries(paymentMethod: "cash" | "transfer" | "pos") {
  return apiFetch<{ matched_count: number; items: LedgerRow[] }>(
    "/api/v1/barbershop/ledger/match-all",
    {
      method: "POST",
      body: JSON.stringify({ payment_method: paymentMethod }),
    },
  );
}

export function resolveMismatchUseEmployeeAmount(employeeEntryId: string) {
  return apiFetch<{ employee: LedgerRow; manager: LedgerRow }>(
    "/api/v1/barbershop/ledger/mismatch/resolve",
    {
      method: "POST",
      body: JSON.stringify({ employee_entry_id: employeeEntryId }),
    },
  );
}

export function getOperationsSummary(params: {
  preset: "today" | "week" | "month" | "year" | "all" | "custom";
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("preset", params.preset);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return apiFetch<OperationsSummaryResponse>(
    `/api/v1/barbershop/analytics/summary?${qs.toString()}`,
  );
}

export function createBarbershopLedgerEntry(body: Record<string, unknown>) {
  return apiFetch<LedgerRow>("/api/v1/barbershop/ledger", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchBarbershopLedgerEntry(
  entryId: string,
  body: {
    amount?: number;
    service_type_id?: string;
    sale_category_id?: string;
    expense_category_id?: string;
    note?: string | null;
  },
) {
  return apiFetch<LedgerRow>(`/api/v1/barbershop/ledger/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function voidBarbershopLedgerEntry(entryId: string, reason: string) {
  return apiFetch<LedgerRow>(`/api/v1/barbershop/ledger/${entryId}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function correctLedgerPaymentMethod(
  entryId: string,
  body: { new_payment_method: "cash" | "transfer" | "pos"; reason: string },
) {
  return apiFetch<LedgerRow>(`/api/v1/barbershop/ledger/${entryId}/correct-payment-method`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type PendingReconciliationIndex = {
  entry_id: string;
  barber_sequence_index: number | null;
  index_label: string | null;
  service_type_id: string | null;
  service_name: string;
  employee_amount: string;
  occurred_at: string;
};

export function listPendingReconciliationIndexes(
  barberUserId: string,
  businessDate: string,
) {
  return apiFetch<{ business_date: string; items: PendingReconciliationIndex[] }>(
    `/api/v1/manager/reconciliation/day/${barberUserId}/${businessDate}/pending-indexes`,
  );
}

export type DirectoryBarberDetail = {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  commission_pct?: string | null;
  salary_type?: SalaryType;
};

export type DirectoryTeamDetail = DirectoryBarberDetail & {
  role: "manager" | "barber" | "staff";
  fixed_salary?: string | null;
};

export function getDirectoryTeamMember(id: string) {
  return apiFetch<{ found: boolean; member?: DirectoryTeamDetail }>(
    `/api/v1/barbershop/directory/team/${id}`,
  );
}

export function getDirectoryBarber(id: string) {
  return apiFetch<{ found: boolean; barber?: DirectoryBarberDetail }>(
    `/api/v1/barbershop/directory/barbers/${id}`,
  );
}

export function getDirectoryTeamMemberMonthStats(
  id: string,
  year?: number,
  month?: number,
) {
  const qs = new URLSearchParams();
  if (year) qs.set("year", String(year));
  if (month) qs.set("month", String(month));
  const q = qs.toString();
  return apiFetch<{
    found: boolean;
    year?: number;
    month?: number;
    role?: "manager" | "barber" | "staff";
    commission_pct?: string;
    fixed_salary?: string | null;
    salary_type?: SalaryType;
    current_month_gross_recorded?: string;
    current_month_services_count?: number;
    all_time_gross_recorded?: string;
    all_time_services_count?: number;
    all_time_approved_total?: string;
    all_time_commission_total?: string;
    pending_total?: string;
    approved_total?: string;
    mismatch_indexes?: number[];
    mismatch_index_labels?: string[];
    expected_payout_on_approved?: string;
    actual_payout_on_approved?: string;
    attendance_deductions_total?: string;
    attendance_late_deductions_total?: string;
    attendance_absence_deductions_total?: string;
    reconciliation_posture?: ReconciliationPosture;
  }>(`/api/v1/barbershop/directory/team/${id}/month-stats${q ? `?${q}` : ""}`);
}

export function getDirectoryBarberMonthStats(
  id: string,
  year?: number,
  month?: number,
) {
  const qs = new URLSearchParams();
  if (year) qs.set("year", String(year));
  if (month) qs.set("month", String(month));
  const q = qs.toString();
  return apiFetch<{
    found: boolean;
    year?: number;
    month?: number;
    commission_pct?: string;
    current_month_gross_recorded?: string;
    current_month_services_count?: number;
    all_time_gross_recorded?: string;
    all_time_services_count?: number;
    all_time_approved_total?: string;
    all_time_commission_total?: string;
    pending_total?: string;
    approved_total?: string;
    mismatch_indexes?: number[];
    mismatch_index_labels?: string[];
    expected_payout_on_approved?: string;
  }>(
    `/api/v1/barbershop/directory/barbers/${id}/month-stats${q ? `?${q}` : ""}`,
  );
}

export type DirectoryBarberLedgerRow = {
  id: string;
  barber_sequence_index: number | null;
  occurred_at: string;
  business_date: string | null;
  service_type_id: string | null;
  amount: string;
  original_barber_amount: string | null;
  manager_approved_amount: string | null;
  reconciliation_status: string | null;
  payment_method: "cash" | "transfer" | "pos" | "cash_shop" | "admin_transfer" | null;
  note: string | null;
};

export function listDirectoryBarberLedger(
  id: string,
  opts?: { year?: number; month?: number; page?: number; page_size?: number },
) {
  const qs = new URLSearchParams();
  if (opts?.year) qs.set("year", String(opts.year));
  if (opts?.month) qs.set("month", String(opts.month));
  if (opts?.page) qs.set("page", String(opts.page));
  if (opts?.page_size) qs.set("page_size", String(opts.page_size));
  const q = qs.toString();
  return apiFetch<{ page: number; page_size: number; total: number; items: DirectoryBarberLedgerRow[] }>(
    `/api/v1/barbershop/directory/barbers/${id}/ledger${q ? `?${q}` : ""}`,
  );
}

export type DirectoryBarberReconciliationRow = {
  id: string;
  business_date: string;
  status: string;
  manager_proposal_version: number;
  total_original_barber: string;
  total_manager_approved: string;
  used_manager_entries_due_to_missing_barber: boolean;
  barber_rejection_reason: string | null;
  settled_at: string | null;
  admin_resolved_at: string | null;
  admin_final_day_total: string | null;
};

export function listDirectoryBarberReconciliations(
  id: string,
  opts?: { page?: number; page_size?: number },
) {
  const qs = new URLSearchParams();
  if (opts?.page) qs.set("page", String(opts.page));
  if (opts?.page_size) qs.set("page_size", String(opts.page_size));
  const q = qs.toString();
  return apiFetch<{ page: number; page_size: number; total: number; items: DirectoryBarberReconciliationRow[] }>(
    `/api/v1/barbershop/directory/barbers/${id}/reconciliations${q ? `?${q}` : ""}`,
  );
}

export function listDirectoryTeamMemberLedger(
  id: string,
  opts?: { year?: number; month?: number; page?: number; page_size?: number },
) {
  const qs = new URLSearchParams();
  if (opts?.year) qs.set("year", String(opts.year));
  if (opts?.month) qs.set("month", String(opts.month));
  if (opts?.page) qs.set("page", String(opts.page));
  if (opts?.page_size) qs.set("page_size", String(opts.page_size));
  const q = qs.toString();
  return apiFetch<{ page: number; page_size: number; total: number; items: DirectoryBarberLedgerRow[] }>(
    `/api/v1/barbershop/directory/team/${id}/ledger${q ? `?${q}` : ""}`,
  );
}

export function listDirectoryTeamMemberReconciliations(
  id: string,
  opts?: { page?: number; page_size?: number },
) {
  const qs = new URLSearchParams();
  if (opts?.page) qs.set("page", String(opts.page));
  if (opts?.page_size) qs.set("page_size", String(opts.page_size));
  const q = qs.toString();
  return apiFetch<{ page: number; page_size: number; total: number; items: DirectoryBarberReconciliationRow[] }>(
    `/api/v1/barbershop/directory/team/${id}/reconciliations${q ? `?${q}` : ""}`,
  );
}

export type ReconciliationStreamSide = {
  id: string;
  amount: string;
  service_name: string;
  service_type_id?: string | null;
  occurred_at: string;
  business_date?: string | null;
  payment_method?: string | null;
  note?: string | null;
  reconciliation_status?: string | null;
  record_lifecycle?: string;
  is_voided?: boolean;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by_user_id?: string | null;
  pending_void_reason?: string | null;
  pending_void_by_user_id?: string | null;
  pending_void_requested_at?: string | null;
  approved_at?: string | null;
};

export type PaymentMethodAdjustmentRow = {
  id: string;
  original_method: "cash" | "transfer" | "pos";
  new_method: "cash" | "transfer" | "pos";
  corrected_by_user_id: string;
  corrected_by_label: string | null;
  reason: string;
  created_at: string;
};

export type ReconciliationWorkspaceRow = {
  id: string;
  employee_entry_id?: string | null;
  manager_entry_id?: string | null;
  index: number | null;
  index_label: string | null;
  financial_year?: number | null;
  financial_month?: number | null;
  service_name: string;
  employee_amount: string | null;
  manager_amount: string | null;
  employee?: ReconciliationStreamSide | null;
  manager?: ReconciliationStreamSide | null;
  employee_label: string | null;
  manager_label: string | null;
  comparison_status: string;
  reconciliation_status: string | null;
  reconciled_at?: string | null;
  business_date: string | null;
  occurred_at: string;
  payment_method?: string | null;
  note?: string | null;
  is_manager_created_without_barber?: boolean;
  amount?: string | null;
  display_amount?: string | null;
  payment_method_adjustments?: PaymentMethodAdjustmentRow[];
};

export type OperationalMonthItem = {
  year: number;
  month: number;
  state?: string;
  is_current?: boolean;
};

export type ReconciliationHistoryResponse = {
  year: number;
  month: number;
  is_current_month: boolean;
  read_only?: boolean;
  page: number;
  page_size: number;
  total: number;
  items: ReconciliationWorkspaceRow[];
};

export function getDirectoryTeamMemberReconciliationWorkspace(
  id: string,
  opts: { date: string; page?: number; page_size?: number },
) {
  const qs = new URLSearchParams();
  qs.set("date", opts.date);
  if (opts.page) qs.set("page", String(opts.page));
  if (opts.page_size) qs.set("page_size", String(opts.page_size));
  return apiFetch<{
    business_date: string;
    page: number;
    page_size: number;
    total: number;
    daily_summary_status: string | null;
    items: ReconciliationWorkspaceRow[];
  }>(`/api/v1/barbershop/directory/team/${id}/reconciliation-workspace?${qs.toString()}`);
}

export type CommissionStatementRow = {
  id: string;
  financial_month_id: string;
  user_id: string;
  approved_service_revenue_total: string;
  commission_pct_at_close: string;
  commission_amount: string;
  status: string;
  payout_state: "unpaid" | "paid";
  payout_marked_at: string | null;
  payout_payment_date: string | null;
  payout_paid_by_label: string | null;
  payout_note: string | null;
};

export function listCommissionStatements() {
  return apiFetch<{ items: CommissionStatementRow[] }>("/api/v1/finance/commission-statements");
}

export function markCommissionStatementPaid(
  statementId: string,
  body: { payment_date: string; paid_by_label: string; note?: string | null },
) {
  return apiFetch<{ id: string; payout_state: "unpaid" | "paid" }>(
    `/api/v1/finance/commission-statements/${statementId}/mark-paid`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export type CommissionPayrollWaiverRow = {
  id: string;
  user_id: string;
  employee_name: string | null;
  business_date: string;
  status: string;
  waiver_reason: string | null;
  waived_at: string | null;
  waived_by_name: string | null;
  original_deduction_amount: string;
  deduction_reason: string | null;
};

export type CommissionPayrollRow = {
  user_id: string;
  display_name: string;
  username: string;
  role: string;
  approved_revenue: string;
  matched_service_total: string;
  commission_pct: string;
  expected_commission: string;
  late_deductions: string;
  absence_deductions: string;
  other_deductions: string;
  attendance_deductions_total: string;
  final_commission_payable: string;
  status: string;
  payout_state: string;
  statement_id: string | null;
  attendance_deduction_items?: AttendanceDeductionItem[];
  attendance_waivers?: CommissionPayrollWaiverRow[];
};

export type SalaryPayrollRow = {
  user_id: string;
  display_name: string;
  username: string;
  role: string;
  monthly_salary: string;
  late_deductions: string;
  absence_deductions: string;
  other_deductions: string;
  attendance_deductions_total: string;
  final_salary_payable: string;
  status: string;
  attendance_deduction_items?: AttendanceDeductionItem[];
  attendance_waivers?: CommissionPayrollWaiverRow[];
};

export type CommissionPayrollSummary = {
  year: number;
  month: number;
  financial_month_id: string | null;
  state: string;
  is_current?: boolean;
  commission_total: string;
  salary_total: string;
  items: CommissionPayrollRow[];
  salary_items: SalaryPayrollRow[];
};

export function getCommissionPayroll(year?: number, month?: number) {
  const qs = new URLSearchParams();
  if (year) qs.set("year", String(year));
  if (month) qs.set("month", String(month));
  const q = qs.toString();
  return apiFetch<CommissionPayrollSummary>(
    `/api/v1/finance/commission-payroll${q ? `?${q}` : ""}`,
  );
}

export type ReconciliationQueueRow = {
  summary_id: string;
  barber_user_id: string;
  barber_label: string;
  business_date: string;
  status: string;
  manager_proposal_version: number;
  total_original_barber: string;
  total_manager_approved: string;
  used_manager_entries_due_to_missing_barber: boolean;
  barber_rejection_reason: string | null;
  last_manager_action_at: string | null;
};

export function listReconciliationQueue() {
  return apiFetch<{ items: ReconciliationQueueRow[] }>(
    "/api/v1/manager/reconciliation/queue",
  );
}

export function getManagerReconciliationDayDetail(barberUserId: string, businessDay: string) {
  return apiFetch<{
    summary: {
      id: string;
      status: string;
      manager_proposal_version: number;
      total_original_barber: string;
      total_manager_approved: string;
      used_manager_entries_due_to_missing_barber: boolean;
      barber_rejection_reason: string | null;
      admin_final_day_total: string | null;
    };
    issues: {
      duplicate_indexes: number[];
      amount_mismatches: Array<{
        index: number;
        entry_id: string;
        original_barber_amount: string;
        manager_approved_amount: string;
      }>;
      indexes_present: number[];
      missing_manager_indexes: number[];
    };
    total_entries: number;
    items: Array<{
      id: string;
      barber_sequence_index: number | null;
      occurred_at: string;
      business_date: string | null;
      amount: string;
      original_barber_amount: string | null;
      manager_approved_amount: string | null;
      reconciliation_status: string | null;
      is_manager_created_without_barber: boolean;
    }>;
    timeline: Array<{
      event_type: string;
      message: string | null;
      created_at: string;
      payload: unknown;
    }>;
  }>(
    `/api/v1/manager/reconciliation/day/${barberUserId}/${businessDay}/detail`,
  );
}

export function managerProposeDay(barberUserId: string, businessDay: string, body: Record<string, unknown>) {
  return apiFetch<{ summary_id: string; status: string; version: number }>(
    `/api/v1/manager/reconciliation/day/${barberUserId}/${businessDay}/propose`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function managerReviseDay(barberUserId: string, businessDay: string, body: Record<string, unknown>) {
  return apiFetch<{ summary_id: string; status: string; version: number }>(
    `/api/v1/manager/reconciliation/day/${barberUserId}/${businessDay}/revise`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export type BarberDashboardStats = {
  year: number;
  month: number;
  commission_pct: string;
  current_month_gross_recorded: string;
  current_month_services_count: number;
  all_time_gross_recorded: string;
  all_time_services_count: number;
  all_time_approved_total?: string;
  all_time_commission_total: string;
  pending_total: string;
  approved_total: string;
  mismatch_indexes: number[];
  mismatch_index_labels?: string[];
  expected_payout_on_approved: string;
  actual_payout_on_approved?: string;
  attendance_deductions_total?: string;
  attendance_late_deductions_total?: string;
  attendance_absence_deductions_total?: string;
};

export function getBarberDashboard(year?: number, month?: number) {
  const qs = new URLSearchParams();
  if (year) qs.set("year", String(year));
  if (month) qs.set("month", String(month));
  const q = qs.toString();
  return apiFetch<BarberDashboardStats>(`/api/v1/barber/dashboard${q ? `?${q}` : ""}`);
}

export type BarberLedgerServiceRow = {
  id: string;
  barber_sequence_index: number | null;
  index_label?: string | null;
  occurred_at: string;
  business_date: string | null;
  service_type_id?: string | null;
  service_name?: string;
  amount?: string | null;
  display_amount?: string | null;
  employee_amount?: string | null;
  manager_amount?: string | null;
  employee?: ReconciliationStreamSide | null;
  manager?: ReconciliationStreamSide | null;
  original_barber_amount: string | null;
  manager_approved_amount: string | null;
  comparison_status?: string;
  reconciliation_status: string | null;
  is_manager_created_without_barber: boolean;
  payment_method: "cash" | "transfer" | "pos" | "cash_shop" | "admin_transfer" | null;
  note: string | null;
};

export function getBarberOperationalMonths() {
  return apiFetch<{ items: OperationalMonthItem[] }>("/api/v1/barber/reconciliation/months");
}

export function getBarberReconciliationHistory(opts: {
  year?: number;
  month?: number;
  page?: number;
  page_size?: number;
}) {
  const qs = new URLSearchParams();
  if (opts.year) qs.set("year", String(opts.year));
  if (opts.month) qs.set("month", String(opts.month));
  if (opts.page) qs.set("page", String(opts.page));
  if (opts.page_size) qs.set("page_size", String(opts.page_size));
  const q = qs.toString();
  return apiFetch<ReconciliationHistoryResponse>(
    `/api/v1/barber/reconciliation/history${q ? `?${q}` : ""}`,
  );
}

export function getDirectoryTeamMemberOperationalMonths(id: string) {
  return apiFetch<{ items: OperationalMonthItem[] }>(
    `/api/v1/barbershop/directory/team/${id}/reconciliation-months`,
  );
}

export function getDirectoryTeamMemberReconciliationHistory(
  id: string,
  opts: { year?: number; month?: number; page?: number; page_size?: number },
) {
  const qs = new URLSearchParams();
  if (opts.year) qs.set("year", String(opts.year));
  if (opts.month) qs.set("month", String(opts.month));
  if (opts.page) qs.set("page", String(opts.page));
  if (opts.page_size) qs.set("page_size", String(opts.page_size));
  const q = qs.toString();
  return apiFetch<ReconciliationHistoryResponse>(
    `/api/v1/barbershop/directory/team/${id}/reconciliation-history${q ? `?${q}` : ""}`,
  );
}

export function getBarberReconciliationWorkspace(
  businessDate: string,
  page = 1,
  pageSize = 15,
) {
  const qs = new URLSearchParams({
    business_date: businessDate,
    page: String(page),
    page_size: String(pageSize),
  });
  return apiFetch<{
    business_date: string;
    page: number;
    page_size: number;
    total: number;
    daily_summary_status: string;
    items: ReconciliationWorkspaceRow[];
  }>(`/api/v1/barber/reconciliation/workspace?${qs}`);
}

export function listBarberDayLedger(
  businessDate: string,
  page = 1,
  pageSize = 50,
) {
  const qs = new URLSearchParams({
    business_date: businessDate,
    page: String(page),
    page_size: String(pageSize),
  });
  return apiFetch<{
    business_date: string;
    page: number;
    page_size: number;
    total: number;
    items: BarberLedgerServiceRow[];
  }>(`/api/v1/barber/ledger/day?${qs}`);
}

export function createBarberServiceEntry(body: {
  occurred_at: string;
  service_type_id: string;
  amount: number;
  note?: string | null;
}) {
  return apiFetch<BarberLedgerServiceRow>("/api/v1/barber/ledger/service", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchBarberServiceEntry(
  entryId: string,
  body: {
    amount?: number;
    service_type_id?: string;
    note?: string | null;
  },
) {
  return apiFetch<BarberLedgerServiceRow>(`/api/v1/barber/ledger/service/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function voidBarberServiceEntry(entryId: string, reason: string) {
  return apiFetch<BarberLedgerServiceRow>(
    `/api/v1/barber/ledger/service/${entryId}/void`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
}

export function listBarberPendingVoids() {
  return apiFetch<{ items: PendingVoidRequest[]; total: number }>(
    "/api/v1/barber/ledger/pending-voids",
  );
}

export function acceptBarberPendingVoid(entryId: string) {
  return apiFetch<BarberLedgerServiceRow>(
    `/api/v1/barber/ledger/service/${entryId}/accept-void`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function barberGetReconciliationDay(businessDay: string) {
  return apiFetch<{
    summary: {
      id: string;
      status: string;
      manager_proposal_version: number;
      total_original_barber: string;
      total_manager_approved: string;
      used_manager_entries_due_to_missing_barber: boolean;
      barber_rejection_reason: string | null;
      admin_final_day_total: string | null;
    };
    entries: Array<{
      id: string;
      barber_sequence_index: number | null;
      occurred_at: string;
      business_date: string | null;
      service_type_id: string | null;
      amount: string;
      original_barber_amount: string | null;
      manager_approved_amount: string | null;
      reconciliation_status: string | null;
      is_manager_created_without_barber: boolean;
      payment_method: "cash" | "transfer" | "pos" | "cash_shop" | "admin_transfer" | null;
      note: string | null;
    }>;
    issues: {
      duplicate_indexes: number[];
      amount_mismatches: Array<{
        index: number;
        entry_id: string;
        original_barber_amount: string;
        manager_approved_amount: string;
      }>;
      indexes_present: number[];
      missing_manager_indexes: number[];
    };
    timeline: Array<{
      event_type: string;
      message: string | null;
      created_at: string;
      payload: unknown;
    }>;
  }>(`/api/v1/barber/reconciliation/day/${businessDay}`);
}

export function barberAcceptReconciliationDay(businessDay: string) {
  return apiFetch<{ summary_id: string; status: string }>(
    `/api/v1/barber/reconciliation/day/${businessDay}/accept`,
    { method: "POST" },
  );
}

export function barberRejectReconciliationDay(businessDay: string, reason: string) {
  return apiFetch<{ summary_id: string; status: string }>(
    `/api/v1/barber/reconciliation/day/${businessDay}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

// —— Attendance ——

export type AttendanceStatus = "on_time" | "late" | "absent";

export type AttendanceRecordRow = {
  id: string;
  user_id: string;
  business_date: string;
  signed_in_at: string | null;
  status: AttendanceStatus | string;
  deduction_amount: string;
  deduction_reason: string | null;
  sign_in_latitude?: string | null;
  sign_in_longitude?: string | null;
  is_waived?: boolean;
  waived_at?: string | null;
  waiver_reason?: string | null;
  original_deduction_amount?: string | null;
  waived_by?: {
    id: string;
    username?: string;
    full_name?: string | null;
  } | null;
};

export type AttendanceWaiverRow = {
  id: string;
  user_id: string;
  employee_name: string | null;
  business_date: string;
  status: string;
  waiver_reason: string | null;
  waived_at: string | null;
  waived_by_user_id: string | null;
  waived_by_name: string | null;
  original_deduction_amount: string;
  deduction_reason: string | null;
};

export type AttendanceSettingsRow = {
  latitude: string;
  longitude: string;
  location_label: string;
  radius_meters: number;
  late_time: string;
  late_deduction_amount: string;
  absence_deduction_amount: string;
  updated_at?: string | null;
  can_edit?: boolean;
};

export type AttendanceMonthSummary = {
  year: number;
  month: number;
  late_deductions_total: string;
  absence_deductions_total: string;
  total_deductions: string;
  items: AttendanceDeductionItem[];
};

export type AttendanceTodayResponse = {
  exempt?: boolean;
  message?: string;
  business_date?: string;
  is_sunday?: boolean;
  is_off_day?: boolean;
  can_sign_in?: boolean;
  attendance_tracking_active?: boolean;
  attendance_start_date?: string | null;
  late_time?: string;
  radius_meters?: number;
  record?: AttendanceRecordRow | null;
};

export function getAttendanceSettings() {
  return apiFetch<{ settings: AttendanceSettingsRow }>("/api/v1/barbershop/attendance/settings");
}

export function updateAttendanceSettings(body: Record<string, unknown>) {
  return apiFetch<{ settings: AttendanceSettingsRow }>("/api/v1/barbershop/attendance/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function getTodayAttendance() {
  return apiFetch<AttendanceTodayResponse>("/api/v1/barbershop/attendance/today");
}

export function signInAttendance(body: { latitude: number; longitude: number }) {
  return apiFetch<{
    message: string;
    record: AttendanceRecordRow;
    payout?: MonthPayoutBreakdown;
  }>("/api/v1/barbershop/attendance/sign-in", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getMyAttendanceHistory(params?: {
  year?: number;
  month?: number;
  page?: number;
  page_size?: number;
}) {
  const q = new URLSearchParams();
  if (params?.year != null) q.set("year", String(params.year));
  if (params?.month != null) q.set("month", String(params.month));
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.page_size != null) q.set("page_size", String(params.page_size));
  const suffix = q.toString() ? `?${q}` : "";
  return apiFetch<{
    year: number;
    month: number;
    page: number;
    page_size: number;
    total: number;
    summary: AttendanceMonthSummary;
    items: AttendanceRecordRow[];
  }>(`/api/v1/barbershop/attendance/me${suffix}`);
}

export function getUserAttendanceHistory(
  userId: string,
  params?: { year?: number; month?: number; page?: number; page_size?: number },
) {
  const q = new URLSearchParams();
  if (params?.year != null) q.set("year", String(params.year));
  if (params?.month != null) q.set("month", String(params.month));
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.page_size != null) q.set("page_size", String(params.page_size));
  const suffix = q.toString() ? `?${q}` : "";
  return apiFetch<{
    user: {
      id: string;
      username: string;
      full_name: string | null;
      role: string;
      attendance_off_days: number[];
      attendance_start_date: string | null;
    };
    year: number;
    month: number;
    page: number;
    page_size: number;
    total: number;
    summary: AttendanceMonthSummary;
    items: AttendanceRecordRow[];
  }>(`/api/v1/barbershop/attendance/users/${userId}${suffix}`);
}

export function listAttendanceTeamRoster() {
  return apiFetch<{
    items: Array<{
      id: string;
      username: string;
      full_name: string | null;
      role: string;
      attendance_off_days: number[];
      attendance_start_date: string | null;
      today_status: string | null;
      today_signed_in_at: string | null;
      today_record?: AttendanceRecordRow | null;
    }>;
    waived_today_count?: number;
    business_date?: string;
  }>("/api/v1/barbershop/attendance/team");
}

export function updateUserAttendanceOffDays(
  userId: string,
  offDays: number[],
  attendanceStartDate?: string | null,
) {
  return apiFetch<{
    user_id: string;
    attendance_off_days: number[];
    attendance_start_date: string | null;
  }>(`/api/v1/barbershop/attendance/users/${userId}/off-days`, {
    method: "PATCH",
    body: JSON.stringify({
      off_days: offDays,
      ...(attendanceStartDate != null ? { attendance_start_date: attendanceStartDate } : {}),
    }),
  });
}

export function activateUserAttendance(userId: string, attendanceStartDate?: string) {
  return apiFetch<{
    user_id: string;
    attendance_off_days: number[];
    attendance_start_date: string | null;
  }>(`/api/v1/barbershop/attendance/users/${userId}/activate`, {
    method: "POST",
    body: JSON.stringify(
      attendanceStartDate ? { attendance_start_date: attendanceStartDate } : {},
    ),
  });
}

export function waiveAllAttendance(body: { business_date: string; reason: string }) {
  return apiFetch<{
    message: string;
    business_date: string;
    waived_count: number;
    items: AttendanceRecordRow[];
  }>("/api/v1/barbershop/attendance/waivers/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function waiveUserAttendance(
  userId: string,
  body: { business_date: string; reason: string },
) {
  return apiFetch<{
    message: string;
    record: AttendanceRecordRow;
    payout?: MonthPayoutBreakdown;
  }>(`/api/v1/barbershop/attendance/waivers/users/${userId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listAttendanceWaivers(params?: {
  year?: number;
  month?: number;
  page?: number;
  page_size?: number;
}) {
  const q = new URLSearchParams();
  if (params?.year != null) q.set("year", String(params.year));
  if (params?.month != null) q.set("month", String(params.month));
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.page_size != null) q.set("page_size", String(params.page_size));
  const suffix = q.toString() ? `?${q}` : "";
  return apiFetch<{
    year: number;
    month: number;
    page: number;
    page_size: number;
    total: number;
    items: AttendanceWaiverRow[];
  }>(`/api/v1/barbershop/attendance/waivers${suffix}`);
}

export function listWaiversForDay(date?: string) {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetch<{
    business_date: string;
    count: number;
    items: AttendanceWaiverRow[];
  }>(`/api/v1/barbershop/attendance/waivers/day${q}`);
}

// --- Furniture domain ---

export type FurnitureOrderStatus = "pending" | "in_progress" | "completed";

export type FurnitureOrderItem = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
  section_id?: string | null;
};

export type FurnitureQuotationSection = {
  id: string;
  title: string;
  sort_order: number;
  items: FurnitureQuotationItem[];
};

export type FurnitureOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_address: string | null;
  customer_phone: string;
  due_date: string;
  status: FurnitureOrderStatus;
  subtotal: number;
  grand_total: number;
  deposit_paid: number;
  outstanding_balance: number;
  items: FurnitureOrderItem[];
  source_quotation_id: string | null;
  source_quotation_number: string | null;
  created_at: string;
  updated_at: string;
};

export type FurnitureDashboardSummary = {
  orders: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
  };
  financial: {
    total_revenue: number;
    deposits_made: number;
    outstanding_balance: number;
  };
};

export function getFurnitureStatus() {
  return apiFetch<{ module: string; implemented: boolean; message: string }>(
    "/api/v1/furniture/status",
  );
}

export function getFurnitureDashboardSummary() {
  return apiFetch<FurnitureDashboardSummary>("/api/v1/furniture/dashboard/summary");
}

export function listFurnitureOrders(q?: string) {
  const suffix = q?.trim() ? `?${new URLSearchParams({ q: q.trim() }).toString()}` : "";
  return apiFetch<{ items: FurnitureOrder[] }>(`/api/v1/furniture/orders${suffix}`);
}

export type FurnitureOrderItemInput = {
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
};

export type FurnitureQuotationSectionInput = {
  title: string;
  items: FurnitureOrderItemInput[];
};

export function createFurnitureOrder(body: {
  customer_name: string;
  customer_address?: string | null;
  customer_phone: string;
  due_date: string;
  items: FurnitureOrderItemInput[];
  initial_deposit?: number;
}) {
  return apiFetch<FurnitureOrder>("/api/v1/furniture/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateFurnitureOrderStatus(orderId: string, status: FurnitureOrderStatus) {
  return apiFetch<FurnitureOrder>(`/api/v1/furniture/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function recordFurnitureOrderDeposit(
  orderId: string,
  body: { amount: number; note?: string | null },
) {
  return apiFetch<FurnitureOrder>(`/api/v1/furniture/orders/${orderId}/deposits`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function apiFetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  const url = `${base()}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new NetworkError();
  }

  if (!res.ok) {
    const text = await res.text();
    let msg = `Request failed (${res.status})`;
    let code: string | undefined;
    if (text) {
      try {
        const json = JSON.parse(text) as ApiErrorBody | Record<string, unknown>;
        if (json && typeof json === "object") {
          const top = json as ApiErrorBody;
          if (typeof top.message === "string") {
            msg = top.message;
            code = top.code;
          } else if ("detail" in json && json.detail && typeof json.detail === "object") {
            const d = json.detail as { message?: string; code?: string };
            if (typeof d.message === "string") msg = d.message;
            if (typeof d.code === "string") code = d.code;
          }
        }
      } catch {
        // non-JSON error body
      }
    }
    const err = new ApiError(res.status, msg, code);
    if (err.skipUserNotification) {
      notifySessionInvalid();
    }
    throw err;
  }

  return res.blob();
}

export type FurnitureQuotationStatus = "draft" | "finalized" | "converted";

export type FurnitureQuotationItem = FurnitureOrderItem;

export type FurnitureQuotation = {
  id: string;
  quotation_number: string;
  customer_name: string;
  customer_address: string | null;
  customer_phone: string;
  date_issued: string;
  status: FurnitureQuotationStatus;
  subtotal: number;
  discount: number;
  tax: number;
  grand_total: number;
  sections: FurnitureQuotationSection[];
  items: FurnitureQuotationItem[];
  created_by: string | null;
  created_by_user_id: string | null;
  converted_order_id: string | null;
  converted_order_number: string | null;
  created_at: string;
  updated_at: string;
  is_autosave_session?: boolean;
};

export type FurnitureQuotationPaymentSettings = {
  account_name: string | null;
  account_number: string | null;
  bank_name: string | null;
  terms_text: string;
  primary_phone: string | null;
  secondary_phone: string | null;
  instagram_handle: string | null;
  company_address: string | null;
};

export function listFurnitureQuotations(q?: string) {
  const suffix = q?.trim() ? `?${new URLSearchParams({ q: q.trim() }).toString()}` : "";
  return apiFetch<{ items: FurnitureQuotation[] }>(`/api/v1/furniture/quotations${suffix}`);
}

export function getFurnitureQuotation(quotationId: string) {
  return apiFetch<FurnitureQuotation>(`/api/v1/furniture/quotations/${quotationId}`);
}

export function createFurnitureQuotation(body: {
  customer_name: string;
  customer_address?: string | null;
  customer_phone: string;
  date_issued: string;
  sections: FurnitureQuotationSectionInput[];
  discount?: number;
  tax?: number;
}) {
  return apiFetch<FurnitureQuotation>("/api/v1/furniture/quotations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateFurnitureQuotation(
  quotationId: string,
  body: {
    customer_name: string;
    customer_address?: string | null;
    customer_phone: string;
    date_issued: string;
    sections: FurnitureQuotationSectionInput[];
    discount?: number;
    tax?: number;
  },
) {
  return apiFetch<FurnitureQuotation>(`/api/v1/furniture/quotations/${quotationId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function finalizeFurnitureQuotation(quotationId: string) {
  return apiFetch<FurnitureQuotation>(`/api/v1/furniture/quotations/${quotationId}/finalize`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function convertFurnitureQuotationToOrder(
  quotationId: string,
  body?: { due_date?: string | null },
) {
  return apiFetch<{ quotation: FurnitureQuotation; order: FurnitureOrder }>(
    `/api/v1/furniture/quotations/${quotationId}/convert`,
    {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    },
  );
}

export function downloadFurnitureQuotationPdf(quotationId: string) {
  return apiFetchBlob(`/api/v1/furniture/quotations/${quotationId}/pdf`);
}

export function getFurnitureQuotationPaymentSettings() {
  return apiFetch<FurnitureQuotationPaymentSettings>(
    "/api/v1/furniture/quotations/payment-settings",
  );
}

export function updateFurnitureQuotationPaymentSettings(
  body: Partial<FurnitureQuotationPaymentSettings>,
) {
  return apiFetch<FurnitureQuotationPaymentSettings>(
    "/api/v1/furniture/quotations/payment-settings",
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

export function getFurnitureQuotationActiveAutosave() {
  return apiFetch<{ draft: FurnitureQuotation | null }>(
    "/api/v1/furniture/quotations/active-autosave",
  );
}

export function autosaveFurnitureQuotation(body: {
  quotation_id?: string | null;
  customer_name?: string;
  customer_address?: string | null;
  customer_phone?: string;
  date_issued: string;
  sections: Array<{
    title: string;
    items: Array<{
      name: string;
      description?: string | null;
      quantity: number;
      unit_price: number;
    }>;
  }>;
  discount?: number;
  tax?: number;
  promote?: boolean;
}) {
  return apiFetch<FurnitureQuotation>("/api/v1/furniture/quotations/autosave", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function discardFurnitureQuotationActiveAutosave() {
  return apiFetch<{ discarded: boolean }>("/api/v1/furniture/quotations/active-autosave", {
    method: "DELETE",
  });
}
