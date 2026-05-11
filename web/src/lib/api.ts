const base = () =>
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(
    /\/$/,
    "",
  );

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

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${base()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

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
    throw new ApiError(res.status, msg, code);
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

export type FinancialMonthRow = {
  id: string;
  year: number;
  month: number;
  state: string;
  closed_at: string | null;
};

export function listFinancialMonths() {
  return apiFetch<{ items: FinancialMonthRow[] }>("/api/v1/finance/months");
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
    | "dispute_requires_admin";
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

export function listServiceTypes() {
  return apiFetch<{ items: CatalogItem[] }>("/api/v1/barbershop/catalog/service-types");
}

export function listSaleCategories() {
  return apiFetch<{ items: CatalogItem[] }>("/api/v1/barbershop/catalog/sale-categories");
}

export function listExpenseCategories() {
  return apiFetch<{ items: CatalogItem[] }>("/api/v1/barbershop/catalog/expense-categories");
}

export type DirectoryBarberRow = {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  commission_pct: string | null;
  salary_type: SalaryType;
};

export function listDirectoryBarbers() {
  return apiFetch<{ items: DirectoryBarberRow[] }>("/api/v1/barbershop/directory/barbers");
}

export type LedgerRow = {
  id: string;
  entry_type: "service" | "sale" | "expense";
  occurred_at: string;
  business_date: string | null;
  amount: string;
  payment_method: "cash" | "transfer" | "pos" | null;
  note: string | null;
  employee_user_id: string | null;
  employee_label: string | null;
  barber_sequence_index: number | null;
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
  service_type: { id: string; name: string } | null;
  sale_category: { id: string; name: string } | null;
  expense_category: { id: string; name: string } | null;
  record_lifecycle: "active" | "deleted" | "purged";
};

export function listBarbershopLedger() {
  return apiFetch<{ items: LedgerRow[] }>("/api/v1/barbershop/ledger");
}

export function createBarbershopLedgerEntry(body: Record<string, unknown>) {
  return apiFetch<LedgerRow>("/api/v1/barbershop/ledger", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type DirectoryBarberDetail = {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  commission_pct: string | null;
  salary_type: SalaryType;
};

export function getDirectoryBarber(id: string) {
  return apiFetch<{ found: boolean; barber?: DirectoryBarberDetail }>(
    `/api/v1/barbershop/directory/barbers/${id}`,
  );
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
    pending_total?: string;
    awaiting_review_total?: string;
    adjusted_or_approved_total?: string;
    settled_total?: string;
    disputed_total?: string;
    expected_payout_on_settled?: string;
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
  payment_method: "cash" | "transfer" | "pos" | null;
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
      payment_method: "cash" | "transfer" | "pos" | null;
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
