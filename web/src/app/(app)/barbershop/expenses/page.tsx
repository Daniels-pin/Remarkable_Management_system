"use client";

import * as React from "react";
import { toast } from "sonner";

import { AddEntryFab } from "@/components/ops/add-entry-fab";
import { ExpenseSourceBreakdownCard } from "@/components/ops/expense-source-breakdown";
import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError, getOperationsSummary, listBarbershopLedger, type LedgerRow } from "@/lib/api";
import { isPayrollExpenseCategory } from "@/lib/expense-category";
import { formatExpensePaymentSource } from "@/lib/expense-payment";
import { isManager } from "@/lib/roles";
import { formatNaira, formatTimeLabel } from "@/lib/format";
import { mapOperationsSummary } from "@/lib/operations-analytics";
import { EMPTY_FINANCIAL_SNAPSHOT } from "@/lib/ops-initial-state";

export default function ExpensesPage() {
  const { session } = useAuth();
  const managerView = isManager(session?.role);
  const [loading, setLoading] = React.useState(true);
  const [sources, setSources] = React.useState(EMPTY_FINANCIAL_SNAPSHOT.expenseSources);
  const [payrollCommission, setPayrollCommission] = React.useState(0);
  const [rows, setRows] = React.useState<LedgerRow[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [summary, ledger] = await Promise.all([
        getOperationsSummary({ preset: "month" }),
        listBarbershopLedger(),
      ]);
      const mapped = mapOperationsSummary(summary);
      setSources(mapped.expenseSources);
      setPayrollCommission(mapped.payrollCommission);
      setRows(
        ledger.items
          .filter((r) => r.entry_type === "expense")
          .filter(
            (r) =>
              !managerView || !isPayrollExpenseCategory(r.expense_category?.name ?? null),
          )
          .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()),
      );
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load expenses.");
      setSources(EMPTY_FINANCIAL_SNAPSHOT.expenseSources);
      setPayrollCommission(0);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [managerView]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  return (
    <BarbershopShell
      title="Expenses"
      subtitle={
        managerView
          ? "Operational shop spend — payroll and payouts are admin-only."
          : "Operational and payroll spend with funding-source visibility."
      }
    >
      <div className="space-y-8">
        {loading ? (
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm text-[var(--muted-foreground)]">Loading expenses…</p>
          </div>
        ) : (
          <>
            <ExpenseSourceBreakdownCard
              sources={sources}
              variant={managerView ? "manager" : "admin"}
              payrollCommission={payrollCommission}
            />

            <div>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Recent expense lines
              </p>
              {rows.length === 0 ? (
                <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
                  <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
                    No expenses recorded this month
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
                    Record shop cash or admin-covered spend to keep operational accounting accurate.
                  </p>
                  <div className="mt-6 flex justify-center">
                    <AddEntryFab entryType="expense" variant="inline" onCreated={() => void load()} />
                  </div>
                </div>
              ) : (
                <Card className="overflow-hidden border-[var(--border)]/90 shadow-[var(--shadow-card)]">
                  <ul className="divide-y divide-[var(--border)]">
                    {rows.map((r) => (
                      <li key={r.id} className="flex flex-col gap-2 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
                        <div className="min-w-0 space-y-1">
                          <p className="text-base font-medium text-[var(--foreground)]">
                            {r.expense_category?.name ?? "Expense"}
                          </p>
                          <p className="text-sm text-[var(--muted-foreground)]">
                            {formatTimeLabel(r.occurred_at)}
                            {formatExpensePaymentSource(r.payment_method) ? (
                              <span> · {formatExpensePaymentSource(r.payment_method)}</span>
                            ) : null}
                          </p>
                          {r.note ? (
                            <p className="text-sm italic text-[var(--muted-foreground)]">“{r.note}”</p>
                          ) : null}
                        </div>
                        <p className="font-[family-name:var(--font-serif)] text-xl font-semibold tabular-nums text-[var(--foreground)]">
                          {formatNaira(Number(r.amount))}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </>
        )}
      </div>

      <AddEntryFab entryType="expense" onCreated={() => void load()} />
    </BarbershopShell>
  );
}
