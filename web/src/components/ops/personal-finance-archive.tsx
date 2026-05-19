"use client";

import * as React from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth-provider";
import { FinancialMonthStatusPill } from "@/components/ops/financial-month-status-pill";
import {
  ApiError,
  listFinancialMonths,
  type FinancialMonthRow,
} from "@/lib/api";
import {
  financialMonthStatusLabel,
  monthLabel,
  normalizeFinancialMonthState,
} from "@/lib/financial-month";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function payoutLabel(state: string | undefined) {
  if (state === "paid") return { label: "Paid", tone: "text-emerald-700 dark:text-emerald-300" };
  if (state === "unpaid") return { label: "Unpaid", tone: "text-amber-800 dark:text-amber-200" };
  return { label: "Pending", tone: "text-[var(--muted-foreground)]" };
}

export function PersonalFinanceArchive() {
  const { session } = useAuth();
  const isStaff = session?.role === "staff";
  const earningsLabel = isStaff ? "Salary earned" : "Commission earned";
  const headline = isStaff ? "Earnings & salary archive" : "Earnings & payout archive";

  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<FinancialMonthRow | null>(null);
  const [months, setMonths] = React.useState<FinancialMonthRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFinancialMonths();
      setMonths(res.items);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load your earnings history.");
      setMonths([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const periodSubline = React.useMemo(() => {
    if (!active) return "—";
    const state = normalizeFinancialMonthState(active.state);
    if (state === "open") {
      return active.is_current ? "Current pay period" : "Open";
    }
    if (state === "grace_period" && active.grace_ends_at) {
      return `Grace until ${new Date(active.grace_ends_at).toLocaleDateString("en-NG", {
        month: "short",
        day: "numeric",
      })}`;
    }
    if (active.locked_at) {
      return `Locked ${new Date(active.locked_at).toLocaleDateString("en-NG")}`;
    }
    return "Historical statement";
  }, [active]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
          {headline}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Your personal statement history — approved totals, expected{" "}
          {isStaff ? "salary" : "commission"}, and payout status. Shop revenue and expenses are not
          shown here.
        </p>
      </header>

      {loading ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--muted-foreground)]">Loading your statements…</p>
        </div>
      ) : months.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
            No statements yet
          </p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)]">
            Months appear here once you have approved reconciliation totals or a finalized pay
            statement.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {months.map((m) => {
            const payout = payoutLabel(m.payout_state);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setActive(m);
                  setOpen(true);
                }}
                className={cn(
                  "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 text-left shadow-[var(--shadow-card)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]",
                  m.is_current && "ring-1 ring-emerald-500/25",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    {monthLabel(m.year, m.month)}
                  </p>
                  {m.is_current ? (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      Current
                    </span>
                  ) : null}
                </div>
                <div className="mt-3">
                  <FinancialMonthStatusPill state={m.state} />
                </div>
                <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--muted-foreground)]">Approved total</span>
                    <span className="tabular-nums font-medium text-[var(--foreground)]">
                      {m.approved_total != null ? formatNaira(Number(m.approved_total)) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--muted-foreground)]">{earningsLabel}</span>
                    <span className="tabular-nums font-medium text-[var(--foreground)]">
                      {m.earnings_amount != null ? formatNaira(Number(m.earnings_amount)) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 pt-1">
                    <span className="text-[var(--muted-foreground)]">Payout</span>
                    <span className={cn("font-medium", payout.tone)}>{payout.label}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {active ? monthLabel(active.year, active.month) : "Statement"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {active ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <FinancialMonthStatusPill state={active.state} />
                  <p className="text-xs text-[var(--muted-foreground)]">{periodSubline}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Card>
                    <CardContent className="space-y-1 p-4 pt-4">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        Matched approved total
                      </p>
                      <p className="text-lg font-semibold tabular-nums">
                        {active.approved_total != null
                          ? formatNaira(Number(active.approved_total))
                          : "—"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 p-4 pt-4">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        {earningsLabel}
                      </p>
                      <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                        {active.earnings_amount != null
                          ? formatNaira(Number(active.earnings_amount))
                          : "—"}
                      </p>
                      {active.commission_pct_at_close ? (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Rate at close: {active.commission_pct_at_close}%
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>

                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Payout
                  </p>
                  <p className="mt-2 text-sm">
                    Status:{" "}
                    <span
                      className={cn("font-medium", payoutLabel(active.payout_state).tone)}
                    >
                      {payoutLabel(active.payout_state).label}
                    </span>
                  </p>
                  {active.payout_payment_date ? (
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      Paid{" "}
                      {new Date(active.payout_payment_date).toLocaleDateString("en-NG", {
                        dateStyle: "medium",
                      })}
                      {active.payout_paid_by_label ? ` · ${active.payout_paid_by_label}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      Payment date will appear once payroll marks this statement paid.
                    </p>
                  )}
                  {active.payout_note ? (
                    <p className="mt-2 text-xs italic text-[var(--muted-foreground)]">
                      {active.payout_note}
                    </p>
                  ) : null}
                </div>

                <p className="text-xs text-[var(--muted-foreground)]">
                  Period status:{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    {financialMonthStatusLabel(active.state)}
                  </span>
                </p>
              </div>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
