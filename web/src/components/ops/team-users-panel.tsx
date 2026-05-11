"use client";

import {
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/auth-provider";
import {
  type AdminUserRow,
  ApiError,
  createAdminUser,
  deactivateAdminUser,
  getAdminUser,
  impersonateUser,
  listAdminUsers,
  listFinancialMonths,
  patchAdminUser,
  purgeAdminUser,
  reactivateAdminUser,
  reopenFinancialMonth,
  resetAdminUserPassword,
  type UserRole,
} from "@/lib/api";
import { formatTimeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

function initials(name: string | null | undefined, username: string) {
  const n = (name ?? "").trim();
  if (n.length >= 2) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

function roleLabel(r: UserRole) {
  switch (r) {
    case "admin":
      return "Admin";
    case "manager":
      return "Manager";
    case "barber":
      return "Barber";
    case "staff":
      return "Staff";
    default:
      return r;
  }
}

function salaryLabel(s: AdminUserRow["salary_type"]) {
  if (!s) return "—";
  if (s === "fixed") return "Fixed";
  if (s === "commission") return "Commission";
  if (s === "fixed_or_commission") return "Hybrid";
  return s;
}

function pctDisplay(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

function moneyDisplay(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
}

function statusPill(status: AdminUserRow["account_status"]) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide";
  if (status === "active") {
    return (
      <span
        className={cn(
          base,
          "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200",
        )}
      >
        Active
      </span>
    );
  }
  if (status === "disabled") {
    return (
      <span
        className={cn(
          base,
          "bg-[var(--muted)] text-[var(--muted-foreground)]",
        )}
      >
        Deactivated
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        "bg-rose-500/12 text-rose-800 dark:text-rose-200",
      )}
    >
      Deleted
    </span>
  );
}

type CreateForm = {
  full_name: string;
  username: string;
  temporary_password: string;
  email: string;
  role: UserRole;
  salary_type: "fixed" | "commission";
  commission_pct: string;
  fixed_salary: string;
  account_status: "active" | "disabled";
};

const defaultCreate = (): CreateForm => ({
  full_name: "",
  username: "",
  temporary_password: "",
  email: "",
  role: "staff",
  salary_type: "fixed",
  commission_pct: "",
  fixed_salary: "",
  account_status: "active",
});

export type TeamUsersPanelHandle = {
  openCreateUser: () => void;
};

export const TeamUsersPanel = React.forwardRef<TeamUsersPanelHandle, object>(
  function TeamUsersPanel(_props, ref) {
  const router = useRouter();
  const { session, refresh } = useAuth();
  const selfId = session?.user_id;

  const [rows, setRows] = React.useState<AdminUserRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState<CreateForm>(defaultCreate);
  const [saving, setSaving] = React.useState(false);

  const [detailUser, setDetailUser] = React.useState<AdminUserRow | null>(null);
  const [editUser, setEditUser] = React.useState<AdminUserRow | null>(null);
  const [editForm, setEditForm] = React.useState<CreateForm>(defaultCreate);

  const [resetTarget, setResetTarget] = React.useState<AdminUserRow | null>(null);
  const [resetResult, setResetResult] = React.useState<string | null>(null);

  const [purgeTarget, setPurgeTarget] = React.useState<AdminUserRow | null>(null);

  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [reopenMonths, setReopenMonths] = React.useState<
    { id: string; label: string; state: string }[]
  >([]);
  const [reopenMonthId, setReopenMonthId] = React.useState("");
  const [reopenReason, setReopenReason] = React.useState("");
  const [reopenBusy, setReopenBusy] = React.useState(false);

  React.useImperativeHandle(ref, () => ({
    openCreateUser: () => {
      setCreateForm(defaultCreate());
      setCreateOpen(true);
    },
  }));

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminUsers();
      setRows(res.items);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load team members.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openEdit = async (u: AdminUserRow) => {
    try {
      const full = await getAdminUser(u.id);
      setEditUser(full);
      setEditForm({
        full_name: full.profile?.full_name ?? "",
        username: full.username,
        temporary_password: "",
        email: full.email,
        role: full.role,
        salary_type:
          full.salary_type === "commission" ? "commission" : "fixed",
        commission_pct:
          full.commission_pct !== null && full.commission_pct !== undefined
            ? String(full.commission_pct)
            : "",
        fixed_salary:
          full.fixed_salary !== null && full.fixed_salary !== undefined
            ? String(full.fixed_salary)
            : "",
        account_status: full.account_status === "disabled" ? "disabled" : "active",
      });
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not open user.");
    }
  };

  const submitCreate = async () => {
    if (!createForm.full_name.trim() || !createForm.username.trim()) {
      toast.error("Name and username are required.");
      return;
    }
    if (createForm.temporary_password.length < 8) {
      toast.error("Temporary password must be at least 8 characters.");
      return;
    }
    if (createForm.role === "barber" && createForm.salary_type === "commission") {
      if (!createForm.commission_pct.trim()) {
        toast.error("Commission percentage is required for this barber.");
        return;
      }
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        full_name: createForm.full_name.trim(),
        username: createForm.username.trim(),
        temporary_password: createForm.temporary_password,
        role: createForm.role,
        salary_type: createForm.salary_type,
        account_status: createForm.account_status,
      };
      if (createForm.email.trim()) body.email = createForm.email.trim();
      if (createForm.role === "barber" && createForm.commission_pct.trim()) {
        body.commission_pct = Number(createForm.commission_pct);
      }
      if (createForm.fixed_salary.trim()) {
        body.fixed_salary = Number(createForm.fixed_salary);
      }
      await createAdminUser(body);
      toast.success("Team member created.");
      setCreateOpen(false);
      setCreateForm(defaultCreate());
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Create failed.");
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (!editUser) return;
    if (editForm.role === "barber" && editForm.salary_type === "commission") {
      if (!editForm.commission_pct.trim()) {
        toast.error("Commission percentage is required for this barber.");
        return;
      }
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        full_name: editForm.full_name.trim(),
        username: editForm.username.trim(),
        email: editForm.email.trim() || undefined,
        role: editForm.role,
        salary_type: editForm.salary_type,
        account_status: editForm.account_status,
      };
      if (editForm.role === "barber") {
        body.commission_pct = editForm.commission_pct.trim()
          ? Number(editForm.commission_pct)
          : null;
      } else {
        body.commission_pct = null;
      }
      if (editForm.fixed_salary.trim()) {
        body.fixed_salary = Number(editForm.fixed_salary);
      } else {
        body.fixed_salary = null;
      }
      await patchAdminUser(editUser.id, body);
      toast.success("Changes saved.");
      setEditUser(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const runDeactivate = async (u: AdminUserRow) => {
    try {
      await deactivateAdminUser(u.id);
      toast.success("User deactivated.");
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not deactivate.");
    }
  };

  const runReactivate = async (u: AdminUserRow) => {
    try {
      await reactivateAdminUser(u.id);
      toast.success("User reactivated.");
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not reactivate.");
    }
  };

  const runImpersonate = async (u: AdminUserRow) => {
    try {
      await impersonateUser(u.id);
      await refresh();
      toast.success(`Now viewing as ${u.profile?.full_name ?? u.username}.`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Impersonation failed.");
    }
  };

  const confirmReset = async () => {
    if (!resetTarget) return;
    setSaving(true);
    try {
      const r = await resetAdminUserPassword(resetTarget.id);
      setResetResult(r.temporary_password);
      toast.success("Temporary password generated.");
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Reset failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmPurge = async () => {
    if (!purgeTarget) return;
    setSaving(true);
    try {
      await purgeAdminUser(purgeTarget.id);
      toast.success("User data purged.");
      setPurgeTarget(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Purge failed.");
    } finally {
      setSaving(false);
    }
  };

  const openReopen = async () => {
    setReopenOpen(true);
    setReopenReason("");
    setReopenMonthId("");
    try {
      const res = await listFinancialMonths();
      const eligible = res.items.filter(
        (m) => m.state === "paid_locked" || m.state === "closed",
      );
      setReopenMonths(
        eligible.map((m) => ({
          id: m.id,
          label: `${m.year}-${String(m.month).padStart(2, "0")} · ${m.state.replace("_", " ")}`,
          state: m.state,
        })),
      );
    } catch {
      setReopenMonths([]);
      toast.error("Could not load financial months.");
    }
  };

  const submitReopen = async () => {
    if (!reopenMonthId || reopenReason.trim().length < 3) {
      toast.error("Pick a month and enter a reason (min. 3 characters).");
      return;
    }
    setReopenBusy(true);
    try {
      await reopenFinancialMonth(reopenMonthId, reopenReason.trim());
      toast.success("Financial month reopened.");
      setReopenOpen(false);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Reopen failed.");
    } finally {
      setReopenBusy(false);
    }
  };

  const createButton = (
    <Button
      type="button"
      size="sm"
      className="h-9 rounded-full px-4 font-medium shadow-sm"
      onClick={() => {
        setCreateForm(defaultCreate());
        setCreateOpen(true);
      }}
    >
      <Plus className="mr-1.5 opacity-80" data-icon="inline-start" />
      Create user
    </Button>
  );

  const formFields = (
    f: CreateForm,
    setF: React.Dispatch<React.SetStateAction<CreateForm>>,
    showPassword: boolean,
  ) => (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="fu-name">Full name</Label>
        <Input
          id="fu-name"
          value={f.full_name}
          onChange={(e) => setF((p) => ({ ...p, full_name: e.target.value }))}
          placeholder="e.g. Ada Okonkwo"
          className="rounded-[var(--radius-md)]"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
        <div className="grid gap-2">
          <Label htmlFor="fu-user">Username</Label>
          <Input
            id="fu-user"
            value={f.username}
            onChange={(e) => setF((p) => ({ ...p, username: e.target.value }))}
            placeholder="login handle"
            autoComplete="off"
            className="rounded-[var(--radius-md)]"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fu-email">Email (optional)</Label>
          <Input
            id="fu-email"
            value={f.email}
            onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))}
            placeholder="name@company.com"
            className="rounded-[var(--radius-md)]"
          />
        </div>
      </div>
      {showPassword ? (
        <div className="grid gap-2">
          <Label htmlFor="fu-pass">Temporary password</Label>
          <Input
            id="fu-pass"
            type="text"
            value={f.temporary_password}
            onChange={(e) =>
              setF((p) => ({ ...p, temporary_password: e.target.value }))
            }
            placeholder="min. 8 characters"
            autoComplete="new-password"
            className="rounded-[var(--radius-md)]"
          />
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
        <div className="grid gap-2">
          <Label>Role</Label>
          <select
            className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            value={f.role}
            onChange={(e) =>
              setF((p) => ({
                ...p,
                role: e.target.value as UserRole,
              }))
            }
          >
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="barber">Barber</option>
            <option value="staff">Staff</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label>Salary type</Label>
          <select
            className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            value={f.salary_type}
            onChange={(e) =>
              setF((p) => ({
                ...p,
                salary_type: e.target.value as "fixed" | "commission",
              }))
            }
          >
            <option value="fixed">Fixed</option>
            <option value="commission">Commission</option>
          </select>
        </div>
      </div>
      {f.role === "barber" ? (
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
          <div className="grid gap-2">
            <Label htmlFor="fu-comm">Commission %</Label>
            <Input
              id="fu-comm"
              inputMode="decimal"
              value={f.commission_pct}
              onChange={(e) =>
                setF((p) => ({ ...p, commission_pct: e.target.value }))
              }
              placeholder={f.salary_type === "commission" ? "e.g. 40" : "optional"}
              className="rounded-[var(--radius-md)]"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fu-fix">Fixed salary (optional)</Label>
            <Input
              id="fu-fix"
              inputMode="decimal"
              value={f.fixed_salary}
              onChange={(e) =>
                setF((p) => ({ ...p, fixed_salary: e.target.value }))
              }
              placeholder="NGN"
              className="rounded-[var(--radius-md)]"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="fu-fix2">Fixed salary (optional)</Label>
          <Input
            id="fu-fix2"
            inputMode="decimal"
            value={f.fixed_salary}
            onChange={(e) =>
              setF((p) => ({ ...p, fixed_salary: e.target.value }))
            }
            placeholder="NGN"
            className="rounded-[var(--radius-md)]"
          />
        </div>
      )}
      <div className="grid gap-2">
        <Label>Account status</Label>
        <select
          className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          value={f.account_status}
          onChange={(e) =>
            setF((p) => ({
              ...p,
              account_status: e.target.value as "active" | "disabled",
            }))
          }
        >
          <option value="active">Active</option>
          <option value="disabled">Deactivated</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-end md:hidden">{createButton}</div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-[var(--muted-foreground)]">
          <Loader2 className="h-6 w-6 animate-spin opacity-60" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)]/40 px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--muted)]">
            <UserRound className="h-7 w-7 text-[var(--muted-foreground)]" />
          </div>
          <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
            No team members added yet
          </p>
          <p className="mt-2 max-w-sm text-sm text-[var(--muted-foreground)]">
            When you are ready, add the first operator. Each person gets their own
            sign-in, role, and pay structure.
          </p>
          <div className="mt-8">{createButton}</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)]/80 bg-[var(--card)] shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:shadow-none">
          <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_0.9fr_0.9fr_0.7fr_1fr_0.9fr_auto] md:gap-3 md:border-b md:border-[var(--border)] md:px-5 md:py-3 md:text-[11px] md:font-medium md:tracking-wide md:text-[var(--muted-foreground)] md:uppercase">
            <span>Member</span>
            <span>Role</span>
            <span>Salary</span>
            <span className="text-center">Comm.</span>
            <span>Status</span>
            <span>Last active</span>
            <span className="text-right pr-1">Actions</span>
          </div>
          <ul className="divide-y divide-[var(--border)]/70">
            {rows.map((u) => {
              const isSelf = u.id === selfId;
              const name = u.profile?.full_name ?? u.username;
              const purged = u.username.startsWith("purged_");
              return (
                <li key={u.id}>
                  <div className="group flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[var(--muted)]/35 md:grid md:grid-cols-[minmax(0,2fr)_0.9fr_0.9fr_0.7fr_1fr_0.9fr_auto] md:items-center md:gap-3 md:px-5 md:py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-10 w-10 border-[var(--border)]/80">
                        <AvatarFallback className="bg-[var(--muted)] text-[12px] font-medium tracking-tight">
                          {initials(u.profile?.full_name, u.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium tracking-tight text-[var(--foreground)]">
                          {name}
                        </p>
                        <p className="truncate text-xs text-[var(--muted-foreground)]">
                          @{u.username}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-[var(--foreground)] md:pt-0">
                      <span className="md:hidden text-[var(--muted-foreground)]">
                        Role ·{" "}
                      </span>
                      {roleLabel(u.role)}
                    </div>
                    <div className="text-sm text-[var(--foreground)] md:pt-0">
                      <span className="md:hidden text-[var(--muted-foreground)]">
                        Salary ·{" "}
                      </span>
                      {salaryLabel(u.salary_type)}
                    </div>
                    <div className="text-sm tabular-nums text-[var(--foreground)] md:text-center">
                      <span className="md:hidden text-[var(--muted-foreground)]">
                        Commission ·{" "}
                      </span>
                      {u.role === "barber" ? pctDisplay(u.commission_pct) : "—"}
                    </div>
                    <div>{statusPill(u.account_status)}</div>
                    <div className="text-sm text-[var(--muted-foreground)] md:pt-0">
                      {u.last_active_at
                        ? formatTimeLabel(u.last_active_at)
                        : "—"}
                    </div>
                    <div className="flex justify-end md:pt-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                            aria-label={`Actions for ${name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[13rem]">
                          <DropdownMenuItem
                            onSelect={() => setDetailUser(u)}
                          >
                            View profile
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              purged ||
                              u.account_status === "deleted"
                            }
                            onSelect={() => void openEdit(u)}
                          >
                            Edit user
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={purged || isSelf}
                            onSelect={() => setResetTarget(u)}
                          >
                            Reset password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              purged ||
                              isSelf ||
                              u.account_status !== "active"
                            }
                            onSelect={() => void runImpersonate(u)}
                          >
                            Impersonate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              purged ||
                              isSelf ||
                              u.account_status !== "active"
                            }
                            onSelect={() => void runDeactivate(u)}
                          >
                            Deactivate user
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              purged ||
                              isSelf ||
                              u.account_status !== "disabled"
                            }
                            onSelect={() => void runReactivate(u)}
                          >
                            Reactivate user
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={
                              purged ||
                              isSelf ||
                              (u.account_status !== "disabled" &&
                                u.account_status !== "deleted")
                            }
                            className="text-rose-600 focus:text-rose-600 dark:text-rose-400"
                            onSelect={() => setPurgeTarget(u)}
                          >
                            Purge deleted user
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void openReopen()}>
                            Reopen locked month
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/barbershop/finance">
                              Override disputes
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[min(100%,28rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New team member</DialogTitle>
            <DialogDescription>
              They will sign in with the username and temporary password you set
              here, then choose a new password on first login.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>{formFields(createForm, setCreateForm, true)}</DialogBody>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submitCreate()}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create user"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editUser)} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="w-[min(100%,28rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Updates apply immediately for sign-in, roles, and payroll fields.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>{formFields(editForm, setEditForm, false)}</DialogBody>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submitEdit()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailUser)} onOpenChange={(o) => !o && setDetailUser(null)}>
        <DialogContent className="w-[min(100%,26rem)]">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
            <DialogDescription>Read-only account summary.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3 text-sm">
            {detailUser ? (
              <>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback>
                      {initials(detailUser.profile?.full_name, detailUser.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {detailUser.profile?.full_name ?? detailUser.username}
                    </p>
                    <p className="text-[var(--muted-foreground)]">
                      @{detailUser.username}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Email
                    </p>
                    <p className="mt-0.5 break-all">{detailUser.email}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Role
                    </p>
                    <p className="mt-0.5">{roleLabel(detailUser.role)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Salary
                    </p>
                    <p className="mt-0.5">{salaryLabel(detailUser.salary_type)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Commission
                    </p>
                    <p className="mt-0.5">
                      {detailUser.role === "barber"
                        ? pctDisplay(detailUser.commission_pct)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Fixed salary
                    </p>
                    <p className="mt-0.5">{moneyDisplay(detailUser.fixed_salary)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Status
                    </p>
                    <p className="mt-0.5 capitalize">{detailUser.account_status}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Password
                    </p>
                    <p className="mt-0.5">
                      {detailUser.must_change_password
                        ? "Must change on next login"
                        : "Up to date"}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(resetTarget) && !resetResult}
        onOpenChange={(o) => {
          if (!o) {
            setResetTarget(null);
            setResetResult(null);
          }
        }}
      >
        <DialogContent className="w-[min(100%,24rem)]">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              A single-use temporary password will be shown once. The team member
              will need to set a new password the next time they sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void confirmReset()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(resetResult)}
        onOpenChange={(o) => {
          if (!o) {
            setResetTarget(null);
            setResetResult(null);
          }
        }}
      >
        <DialogContent className="w-[min(100%,24rem)]">
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
            <DialogDescription>
              Copy this now. For security it is not stored in the browser after you
              close this dialog.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 font-mono text-sm tracking-tight">
              {resetResult}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => {
                if (resetResult) void navigator.clipboard.writeText(resetResult);
                toast.success("Copied to clipboard.");
              }}
            >
              Copy to clipboard
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(purgeTarget)} onOpenChange={(o) => !o && setPurgeTarget(null)}>
        <DialogContent className="w-[min(100%,24rem)]">
          <DialogHeader>
            <DialogTitle>Purge user data</DialogTitle>
            <DialogDescription>
              This permanently anonymizes the account and clears personal fields.
              Financial history that references this user may retain anonymized
              identifiers for audit.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setPurgeTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => void confirmPurge()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Purge account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent className="w-[min(100%,26rem)]">
          <DialogHeader>
            <DialogTitle>Reopen locked month</DialogTitle>
            <DialogDescription>
              Paid-locked months return to closed; closed months return to open. This
              is recorded on the financial timeline.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-2">
              <Label>Month</Label>
              <div className="relative">
                <select
                  className="h-10 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  value={reopenMonthId}
                  onChange={(e) => setReopenMonthId(e.target.value)}
                >
                  <option value="">Select month…</option>
                  {reopenMonths.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reopen-reason">Reason</Label>
              <textarea
                id="reopen-reason"
                rows={3}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                className="resize-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                placeholder="Why does this month need to be reopened?"
              />
            </div>
          </DialogBody>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setReopenOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reopenBusy}
              onClick={() => void submitReopen()}
            >
              {reopenBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reopen month"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

TeamUsersPanel.displayName = "TeamUsersPanel";
