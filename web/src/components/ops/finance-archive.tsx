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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/auth-provider";
import {
  ApiError,
  listCommissionStatements,
  listFinancialMonths,
  markCommissionStatementPaid,
  type CommissionStatementRow,
  type FinancialMonthRow,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

export function FinanceArchive() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";

  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<FinancialMonthRow | null>(null);

  const [months, setMonths] = React.useState<FinancialMonthRow[]>([]);
  const [statements, setStatements] = React.useState<CommissionStatementRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [markOpen, setMarkOpen] = React.useState(false);
  const [markTarget, setMarkTarget] = React.useState<CommissionStatementRow | null>(null);
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([listFinancialMonths(), listCommissionStatements()]);
      setMonths(m.items);
      setStatements(s.items);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load finance.");
      setMonths([]);
      setStatements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

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
    if (active.state === "paid_locked") {
      return { label: "Locked · unpaid items remain", tone: "text-rose-700 dark:text-rose-300" };
    }
    return { label: "Unpaid items pending", tone: "text-amber-800 dark:text-amber-200" };
  }, [active, activeStatements]);

  const lockLabel = React.useMemo(() => {
    if (!active) return "—";
    if (active.state === "open") return "Open";
    if (active.state === "closed") return "Closed";
    return "Paid locked";
  }, [active]);

  const totalCommission = React.useMemo(() => {
    return activeStatements.reduce((acc, s) => acc + Number(s.commission_amount || 0), 0);
  }, [activeStatements]);

  const unpaidCount = React.useMemo(() => {
    return activeStatements.filter((s) => s.payout_state !== "paid").length;
  }, [activeStatements]);

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
      <header className="space-y-2">
        <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
          Financial archive
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Month-by-month posture with payout and lock signals. Select a month for a calm,
          accounting-style breakdown.
        </p>
      </header>

      {loading ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--muted-foreground)]">Loading finance archive…</p>
        </div>
      ) : months.length === 0 ? (
        <div className="space-y-6">
          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
            <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
              No financial data available for this period
            </p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)]">
              Closed months and payout status will populate automatically after finance locks each
              period. Nothing is invented here—this grid stays quiet until real aggregates exist.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((slot) => (
              <div
                key={slot}
                className="rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--card)]/50 p-5 shadow-[var(--shadow-card)]"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Month card
                </p>
                <p className="mt-6 font-[family-name:var(--font-serif)] text-lg font-semibold text-[var(--muted-foreground)]">
                  —
                </p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">Awaiting first close</p>
                <div className="mt-4 space-y-2 border-t border-[var(--border)]/80 pt-3 text-xs text-[var(--muted-foreground)]">
                  <p>Revenue · —</p>
                  <p>Expenses · —</p>
                  <p>Payout · —</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {months.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setActive(m);
                setOpen(true);
              }}
              className={cn(
                "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 text-left shadow-[var(--shadow-card)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]",
                m.state === "paid_locked" && "opacity-95",
              )}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                {monthLabel(m.year, m.month)}
              </p>
              <p className="mt-3 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums text-[var(--foreground)]">
                {m.state.replace(/_/g, " ")}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {m.closed_at ? `Closed ${new Date(m.closed_at).toLocaleDateString("en-NG")}` : "Not closed yet"}
              </p>
              <div className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-3 text-xs">
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
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--muted-foreground)]">Lock</span>
                  <span
                    className={
                      m.state === "paid_locked"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-amber-800 dark:text-amber-200"
                    }
                  >
                    {m.state === "paid_locked" ? "Locked" : m.state}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {active
                ? monthLabel(active.year, active.month)
                : "Month"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {active ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card>
                    <CardContent className="space-y-1 p-4 pt-4">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        Month state
                      </p>
                      <p className="text-lg font-semibold tabular-nums">{lockLabel}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 p-4 pt-4">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        Commission total
                      </p>
                      <p className="text-lg font-semibold tabular-nums">{formatNaira(totalCommission)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 p-4 pt-4">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        Unpaid items
                      </p>
                      <p className="text-lg font-semibold tabular-nums text-amber-800 dark:text-amber-200">
                        {unpaidCount}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Payout status:{" "}
                  <span className={cn("font-medium", payoutState.tone)}>{payoutState.label}</span>.
                </p>

                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                      Commission statements
                    </p>
                    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => void load()}>
                      Refresh
                    </Button>
                  </div>
                  {activeStatements.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
                      No commission statements recorded for this month yet.
                    </div>
                  ) : (
                    <ul className="divide-y divide-[var(--border)]">
                      {activeStatements.map((s) => (
                        <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--foreground)]">
                              Barber · {s.user_id}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                              {formatNaira(Number(s.commission_amount))} · {s.payout_state}
                              {s.payout_payment_date ? ` · paid ${new Date(s.payout_payment_date).toLocaleDateString("en-NG")}` : ""}
                            </p>
                          </div>
                          {isAdmin ? (
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                disabled={s.payout_state === "paid"}
                                onClick={() => beginMarkPaid(s)}
                              >
                                Mark paid
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
              <Input id="pay-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-by">Paid by</Label>
              <Input id="pay-by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} placeholder="e.g. Zenith transfer / Ops team" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-note">Note (optional)</Label>
              <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional context for audit" />
            </div>
            <Button type="button" className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]" disabled={saving} onClick={() => void submitMarkPaid()}>
              {saving ? "Saving…" : "Confirm paid"}
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
