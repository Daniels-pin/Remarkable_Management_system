"use client";

import * as React from "react";
import Link from "next/link";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/auth-provider";
import { FinancialMonthStatusPill } from "@/components/ops/financial-month-status-pill";
import { FinancialMonthSummaryGrid } from "@/components/ops/financial-month-summary-grid";
import { SummaryMetricCard } from "@/components/ops/summary-metric-card";
import {
  ApiError,
  closeFinancialMonth,
  getCommissionPayroll,
  listCommissionStatements,
  listFinancialMonths,
  markCommissionStatementPaid,
  type CommissionStatementRow,
  type FinancialMonthRow,
} from "@/lib/api";
import { ExpenseSourceBreakdownCard } from "@/components/ops/expense-source-breakdown";
import {
  extractFinancialMonthMetrics,
  type FinancialMonthMetrics,
} from "@/lib/financial-month-metrics";
import {
  financialMonthStatusLabel,
  monthLabel,
  normalizeFinancialMonthState,
} from "@/lib/financial-month";
import { formatNaira } from "@/lib/format";
import type { ExpenseSourceBreakdown } from "@/lib/ops-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function FinanceArchive() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const isManager = session?.role === "manager";
  const canCloseMonth = isAdmin || isManager;

  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<FinancialMonthRow | null>(null);

  const [months, setMonths] = React.useState<FinancialMonthRow[]>([]);
  const [statements, setStatements] = React.useState<CommissionStatementRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [closing, setClosing] = React.useState(false);
  const [payrollTotals, setPayrollTotals] = React.useState<{
    commissionTotal: number;
    salaryTotal: number;
  } | null>(null);

  const [markOpen, setMarkOpen] = React.useState(false);
  const [markTarget, setMarkTarget] = React.useState<CommissionStatementRow | null>(null);
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const m = await listFinancialMonths();
      setMonths(m.items);
      if (isAdmin) {
        const s = await listCommissionStatements();
        setStatements(s.items);
      } else {
        setStatements([]);
      }
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load finance.");
      setMonths([]);
      setStatements([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  React.useEffect(() => {
    if (!active || !isAdmin) {
      setPayrollTotals(null);
      return;
    }
    getCommissionPayroll(active.year, active.month)
      .then((res) => {
        setPayrollTotals({
          commissionTotal: Number(res.commission_total) || 0,
          salaryTotal: Number(res.salary_total) || 0,
        });
      })
      .catch(() => setPayrollTotals(null));
  }, [active, isAdmin]);

  const activeStatements = React.useMemo(() => {
    if (!active) return [];
    return statements.filter((s) => s.financial_month_id === active.id);
  }, [active, statements]);

  const payoutState = React.useMemo(() => {
    if (!active) return { label: "—", tone: "text-[var(--muted-foreground)]" };
    if (activeStatements.length === 0) {
      return { label: "No commission statements", tone: "text-[var(--muted-foreground)]" };
    }
    const unpaid = activeStatements.some((s) => s.payout_state !== "paid");
    if (!unpaid) return { label: "Paid out", tone: "text-emerald-700 dark:text-emerald-300" };
    if (normalizeFinancialMonthState(active.state) === "locked") {
      return { label: "Locked · unpaid items remain", tone: "text-rose-700 dark:text-rose-300" };
    }
    return { label: "Unpaid items pending", tone: "text-amber-800 dark:text-amber-200" };
  }, [active, activeStatements]);

  const periodSubline = React.useMemo(() => {
    if (!active) return "—";
    const state = normalizeFinancialMonthState(active.state);
    if (state === "open") {
      return active.is_current ? "Current operational month" : "Open";
    }
    if (state === "grace_period") {
      if (active.grace_ends_at) {
        return `Grace until ${new Date(active.grace_ends_at).toLocaleDateString("en-NG", {
          month: "short",
          day: "numeric",
        })}`;
      }
      if (active.closed_at) {
        return `Entered grace ${new Date(active.closed_at).toLocaleDateString("en-NG")}`;
      }
      return "Grace period";
    }
    if (active.locked_at) {
      return `Locked ${new Date(active.locked_at).toLocaleDateString("en-NG")}`;
    }
    return "Historical record";
  }, [active]);

  const statementCommissionTotal = React.useMemo(() => {
    return activeStatements.reduce((acc, s) => acc + Number(s.commission_amount || 0), 0);
  }, [activeStatements]);

  const unpaidCount = React.useMemo(() => {
    return activeStatements.filter((s) => s.payout_state !== "paid").length;
  }, [activeStatements]);

  const activeExpenseSources = React.useMemo((): ExpenseSourceBreakdown => {
    if (!active?.expense_sources) {
      return {
        shopCash: 0,
        adminTransfer: 0,
        total: 0,
        operationalShopCash: 0,
        operationalAdminTransfer: 0,
        operationalTotal: 0,
      };
    }
    const shopCash = Number(active.expense_sources.shop_cash) || 0;
    const adminTransfer = Number(active.expense_sources.admin_transfer) || 0;
    const total = Number(active.expense_sources.total) || 0;
    const operationalShopCash =
      Number(active.expense_sources.operational_shop_cash) || shopCash;
    const operationalAdminTransfer =
      Number(active.expense_sources.operational_admin_transfer) || adminTransfer;
    const operationalTotal =
      Number(active.expense_sources.operational_total) || total;
    return {
      shopCash,
      adminTransfer,
      total,
      operationalShopCash,
      operationalAdminTransfer,
      operationalTotal,
    };
  }, [active]);

  const activeMetrics = React.useMemo((): FinancialMonthMetrics | null => {
    if (!active) return null;
    return extractFinancialMonthMetrics(active, {
      commissionTotal:
        payrollTotals?.commissionTotal ??
        (activeStatements.length > 0 ? statementCommissionTotal : null),
      salaryTotal: payrollTotals?.salaryTotal ?? null,
    });
  }, [active, payrollTotals, activeStatements.length, statementCommissionTotal]);

  const revenueFor = (m: FinancialMonthRow) => {
    if (m.total_revenue != null) return Number(m.total_revenue) || 0;
    const snap = m.snapshot as { total_revenue?: string } | undefined;
    if (snap?.total_revenue) return Number(snap.total_revenue) || 0;
    return null;
  };

  const expensesFor = (m: FinancialMonthRow) => {
    if (isManager) {
      if (m.operational_expenses != null) return Number(m.operational_expenses) || 0;
      if (m.expense_sources?.operational_total != null) {
        return Number(m.expense_sources.operational_total) || 0;
      }
    }
    if (m.total_expenses != null) return Number(m.total_expenses) || 0;
    if (m.expense_sources?.total) return Number(m.expense_sources.total) || 0;
    return null;
  };

  const netProfitFor = (m: FinancialMonthRow) => {
    const metrics = extractFinancialMonthMetrics(m);
    return metrics.businessNetProfit;
  };

  const handleCloseMonth = async () => {
    if (!active || !canCloseMonth) return;
    if (normalizeFinancialMonthState(active.state) !== "open" || !active.is_current) {
      toast.error("Only the current open month can be closed early.");
      return;
    }
    setClosing(true);
    try {
      await closeFinancialMonth(active.id);
      toast.success("Month moved into grace period.");
      await load();
      setOpen(false);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not close month.");
    } finally {
      setClosing(false);
    }
  };

  const beginMarkPaid = (row: CommissionStatementRow) => {
    setMarkTarget(row);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaidBy("");
    setNote("");
    setMarkOpen(true);
  };

  const submitMarkPaid = async () => {
    if (!markTarget) return;
    if (!paidBy.trim()) {
      toast.error("Enter who paid (e.g. bank transfer reference / operator).");
      return;
    }
    setSaving(true);
    try {
      await markCommissionStatementPaid(markTarget.id, {
        payment_date: new Date(paymentDate).toISOString(),
        paid_by_label: paidBy.trim(),
        note: note.trim() || null,
      });
      toast.success("Commission marked paid.");
      setMarkOpen(false);
      setMarkTarget(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not mark paid.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
              Financial archive
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
              {isAdmin
                ? "Month-by-month posture with revenue, full expenses, payroll, and payout controls."
                : "Month-by-month shop revenue and daily operational expenses. Payroll, rent, and profit are admin-only."}
            </p>
          </div>
          {isAdmin ? (
            <Link
              href="/barbershop/finance/commission-payroll"
              className={buttonVariants({ className: "rounded-full" })}
            >
              Commission payroll
            </Link>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--muted-foreground)]">Loading finance archive…</p>
        </div>
      ) : months.length === 0 ? (
        <div className="space-y-6">
          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
            <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
              No financial periods yet
            </p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)]">
              The active month is created automatically. Archive cards appear as soon as
              operational data exists for each period.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {months.map((m) => {
            const state = normalizeFinancialMonthState(m.state);
            const revenue = revenueFor(m);
            const expenses = expensesFor(m);
            const netProfit = isAdmin ? netProfitFor(m) : null;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setActive(m);
                  setOpen(true);
                }}
                className={cn(
                  "flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 text-left shadow-[var(--shadow-card)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]",
                  state === "locked" && "opacity-95",
                  m.is_current && "ring-1 ring-emerald-500/25",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    {monthLabel(m.year, m.month)}
                  </p>
                  {m.is_current ? (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      Active
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <FinancialMonthStatusPill state={m.state} />
                </div>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {state === "grace_period" && m.grace_ends_at
                    ? `Grace until ${new Date(m.grace_ends_at).toLocaleDateString("en-NG")}`
                    : state === "locked" && m.locked_at
                      ? `Locked ${new Date(m.locked_at).toLocaleDateString("en-NG")}`
                      : state === "open"
                        ? "Operational"
                        : "—"}
                </p>
                <div className="mt-auto space-y-1.5 border-t border-[var(--border)] pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--muted-foreground)]">Revenue</span>
                    <span className="tabular-nums text-[var(--foreground)]">
                      {revenue != null ? formatNaira(revenue) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--muted-foreground)]">
                      {isManager ? "Operational" : "Expenses"}
                    </span>
                    <span className="tabular-nums text-[var(--foreground)]">
                      {expenses != null ? formatNaira(expenses) : "—"}
                    </span>
                  </div>
                  {isAdmin ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-[var(--muted-foreground)]">Net profit</span>
                      <span className="tabular-nums text-[var(--foreground)]">
                        {netProfit != null ? formatNaira(netProfit) : "—"}
                      </span>
                    </div>
                  ) : null}
                  {isAdmin ? (
                    <div className="flex justify-between gap-2 pt-1">
                      <span className="text-[var(--muted-foreground)]">Payout</span>
                      <span className="text-[var(--foreground)]">
                        {statements.some((s) => s.financial_month_id === m.id)
                          ? statements
                              .filter((s) => s.financial_month_id === m.id)
                              .some((s) => s.payout_state !== "paid")
                            ? "Unpaid items"
                            : "Paid out"
                          : "—"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] w-[min(100%,42rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {active ? monthLabel(active.year, active.month) : "Month"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {active && activeMetrics ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <FinancialMonthStatusPill state={active.state} />
                  <p className="text-xs text-[var(--muted-foreground)]">{periodSubline}</p>
                </div>

                <FinancialMonthSummaryGrid
                  metrics={activeMetrics}
                  variant={isAdmin ? "admin" : "manager"}
                />

                {isAdmin ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SummaryMetricCard
                      label="Unpaid commission items"
                      value={String(unpaidCount)}
                      tone={unpaidCount > 0 ? "negative" : "muted"}
                      hint="Commission statements awaiting payout"
                      className="h-full"
                    />
                    <SummaryMetricCard
                      label="Payout posture"
                      value={payoutState.label}
                      tone="default"
                      hint={financialMonthStatusLabel(active.state)}
                      className="h-full"
                    />
                  </div>
                ) : null}

                <p className="text-sm text-[var(--muted-foreground)]">
                  Status:{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    {financialMonthStatusLabel(active.state)}
                  </span>
                  {isAdmin ? (
                    <>
                      {" · "}
                      Payout:{" "}
                      <span className={cn("font-medium", payoutState.tone)}>{payoutState.label}</span>
                    </>
                  ) : null}
                </p>

                {canCloseMonth &&
                active.is_current &&
                normalizeFinancialMonthState(active.state) === "open" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    disabled={closing}
                    onClick={() => void handleCloseMonth()}
                  >
                    {closing ? "Closing…" : "Close month early (grace period)"}
                  </Button>
                ) : null}

                <ExpenseSourceBreakdownCard
                  sources={activeExpenseSources}
                  variant={isAdmin ? "admin" : "manager"}
                  payrollCommission={
                    isAdmin ? Number(active.payroll_commission ?? 0) : 0
                  }
                  rentExpenses={isAdmin ? Number(active.rent_expenses ?? 0) : 0}
                  compact
                />

                {isAdmin ? (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                        Commission statements
                      </p>
                      <div className="flex gap-2">
                        <Link
                          href={`/barbershop/finance/commission-payroll?year=${active.year}&month=${active.month}`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                            className: "rounded-full",
                          })}
                        >
                          Payroll summary
                        </Link>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => void load()}
                        >
                          Refresh
                        </Button>
                      </div>
                    </div>
                    {activeStatements.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
                        No commission statements recorded for this month yet.
                      </div>
                    ) : (
                      <ul className="divide-y divide-[var(--border)]">
                        {activeStatements.map((s) => (
                          <li
                            key={s.id}
                            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--foreground)]">
                                Barber · {s.user_id}
                              </p>
                              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                                {formatNaira(Number(s.commission_amount))} · {s.payout_state}
                                {s.payout_payment_date
                                  ? ` · paid ${new Date(s.payout_payment_date).toLocaleDateString("en-NG")}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                disabled={
                                  s.payout_state === "paid" ||
                                  normalizeFinancialMonthState(active.state) === "locked"
                                }
                                onClick={() => beginMarkPaid(s)}
                              >
                                Mark paid
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={markOpen} onOpenChange={setMarkOpen}>
        <DialogContent className="w-[min(100%,26rem)]">
          <DialogHeader>
            <DialogTitle>Mark commission paid</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pay-date">Payment date</Label>
              <Input
                id="pay-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-by">Paid by</Label>
              <Input
                id="pay-by"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                placeholder="e.g. Zenith transfer / Ops team"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-note">Note (optional)</Label>
              <Input
                id="pay-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional context for audit"
              />
            </div>
            <Button
              type="button"
              className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]"
              disabled={saving}
              onClick={() => void submitMarkPaid()}
            >
              {saving ? "Saving…" : "Confirm paid"}
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
