"use client";

import * as React from "react";

import { AddEntryFab } from "@/components/ops/add-entry-fab";
import { ReconciliationReviewDialog } from "@/components/ops/reconciliation-review-dialog";
import { StatusBadge } from "@/components/ops/status-badge";
import { useOpsNotifications } from "@/components/ops/ops-notifications-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, listBarbershopLedger, type LedgerRow } from "@/lib/api";
import { formatNaira, formatTimeLabel } from "@/lib/format";
import type { LedgerEntryType, LedgerTransaction, TransactionStatus } from "@/lib/ops-types";
import { toast } from "sonner";

type QuickFilter =
  | "all"
  | LedgerEntryType
  | "pending"
  | "approved"
  | "disputed";

const FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "service", label: "Services" },
  { id: "sale", label: "Sales" },
  { id: "expense", label: "Expenses" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "disputed", label: "Disputed" },
];

function typeLabel(t: LedgerTransaction) {
  if (t.type === "service") return t.serviceType ?? "Service";
  if (t.type === "sale") return t.saleCategory ?? "Sale";
  return t.expenseCategory ?? "Expense";
}

function matchesFilter(row: LedgerTransaction, f: QuickFilter) {
  if (f === "all") return true;
  if (f === "pending" || f === "approved" || f === "disputed") {
    return row.status === (f as TransactionStatus);
  }
  return row.type === f;
}

export function DailyLedgerPanel() {
  const { dismissByTransactionId } = useOpsNotifications();
  const [rows, setRows] = React.useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<QuickFilter>("all");
  const [review, setReview] = React.useState<LedgerTransaction | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBarbershopLedger();
      setRows(res.items.map(mapLedgerRow));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load ledger.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const sorted = React.useMemo(() => {
    return [...rows]
      .filter((r) => matchesFilter(r, filter))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rows, filter]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Unified operational timeline. Filter by lane or control state, then drill into
          reconciliation without leaving the flow.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((chip) => (
            <Button
              key={chip.id}
              type="button"
              size="sm"
              variant={filter === chip.id ? "default" : "outline"}
              className={
                filter === chip.id
                  ? "rounded-full border-transparent bg-[var(--foreground)] text-[var(--background)]"
                  : "rounded-full border-dashed"
              }
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden border-[var(--border)]/90 shadow-[var(--shadow-card)]">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-[var(--muted-foreground)]">
            Loading ledger…
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-[var(--card)] px-6 py-16 text-center md:px-10">
            <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
              No transactions recorded yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
              The ledger stays empty until services, sales, and expenses are posted. Use{" "}
              <span className="font-medium text-[var(--foreground)]">Add entry</span> when you are
              ready to capture the first line.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {sorted.map((t) => (
              <li key={t.id} className="group relative bg-[var(--card)] px-4 py-4 md:px-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                        #{t.index}
                      </span>
                      <StatusBadge status={t.status} />
                      <span className="rounded-md bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                        {t.type}
                      </span>
                    </div>
                    <p className="text-base font-medium text-[var(--foreground)]">{typeLabel(t)}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted-foreground)]">
                      {t.employeeName ? <span>{t.employeeName}</span> : <span>House</span>}
                      <span className="tabular-nums">{formatTimeLabel(t.createdAt)}</span>
                      {t.paymentMethod ? (
                        <span className="capitalize">{t.paymentMethod}</span>
                      ) : null}
                    </div>
                    {t.previousAmount != null ? (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        Edited from{" "}
                        <span className="tabular-nums text-[var(--foreground)]">
                          {formatNaira(t.previousAmount)}
                        </span>{" "}
                        →{" "}
                        <span className="tabular-nums font-medium text-[var(--foreground)]">
                          {formatNaira(t.amount)}
                        </span>
                      </p>
                    ) : null}
                    {t.note ? (
                      <p className="text-sm italic text-[var(--muted-foreground)]">“{t.note}”</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 md:pt-0.5">
                    <p className="font-[family-name:var(--font-serif)] text-xl font-semibold tabular-nums tracking-tight text-[var(--foreground)]">
                      {formatNaira(t.amount)}
                    </p>
                    {t.reconciliation ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full border-dashed text-xs"
                        onClick={() => setReview(t)}
                      >
                        Review reconciliation
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ReconciliationReviewDialog
        open={Boolean(review)}
        onOpenChange={(o) => !o && setReview(null)}
        transaction={review}
        onAccept={(id) => {
          dismissByTransactionId(id);
          setRows((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, status: "approved" as const, reconciliation: undefined } : r,
            ),
          );
        }}
        onReject={() => {
          /* keep disputed until a follow-up workflow is implemented */
        }}
      />

      <AddEntryFab onCreated={() => void load()} />
    </div>
  );
}

function statusFromRow(r: LedgerRow): TransactionStatus {
  if (r.entry_type === "sale" || r.entry_type === "expense") return "approved";
  switch (r.reconciliation_status) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "adjusted":
      return "adjusted";
    case "awaiting_barber_review":
      return "awaiting_review";
    case "settled":
      return "settled";
    case "disputed":
      return "disputed";
    case "locked":
      return "locked";
    case "missing_barber_entry":
    case "manager_override":
      return "approved";
    default:
      return "pending";
  }
}

function mapLedgerRow(r: LedgerRow): LedgerTransaction {
  const idx = r.barber_sequence_index ?? 0;
  const amount = Number(r.amount);
  const paymentMethod =
    r.payment_method === "cash" || r.payment_method === "transfer" || r.payment_method === "pos"
      ? r.payment_method
      : null;
  return {
    id: r.id,
    index: idx,
    type: r.entry_type,
    employeeName: r.employee_label,
    employeeId: r.employee_user_id,
    amount: Number.isFinite(amount) ? amount : 0,
    paymentMethod,
    note: r.note,
    status: statusFromRow(r),
    createdAt: r.occurred_at,
    serviceType: r.service_type?.name ?? undefined,
    saleCategory: r.sale_category?.name ?? undefined,
    expenseCategory: r.expense_category?.name ?? undefined,
    reconciliation: undefined,
  };
}
