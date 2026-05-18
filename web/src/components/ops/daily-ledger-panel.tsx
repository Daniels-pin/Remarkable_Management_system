"use client";

import * as React from "react";

import { AddEntryFab, type EntryKind } from "@/components/ops/add-entry-fab";
import { RecordServiceFab } from "@/components/ops/record-service-fab";
import { useAuth } from "@/components/providers/auth-provider";
import { ReconciliationReviewDialog } from "@/components/ops/reconciliation-review-dialog";
import { StatusBadge } from "@/components/ops/status-badge";
import { useOpsNotifications } from "@/components/ops/ops-notifications-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, listBarbershopLedger, type LedgerRow } from "@/lib/api";
import { formatExpensePaymentSource } from "@/lib/expense-payment";
import { formatNaira, formatTimeLabel } from "@/lib/format";
import { isManagerUp, isServiceProvider } from "@/lib/roles";
import type { LedgerEntryType, LedgerTransaction, TransactionStatus } from "@/lib/ops-types";
import { toast } from "sonner";

type QuickFilter =
  | "all"
  | LedgerEntryType
  | "pending"
  | "approved"
  | "disputed";

const MANAGER_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "service", label: "Services" },
  { id: "sale", label: "Sales" },
  { id: "expense", label: "Expenses" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "disputed", label: "Disputed" },
];

const PROVIDER_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "service", label: "Services" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "disputed", label: "Disputed" },
];

function typeLabel(t: LedgerTransaction) {
  if (t.type === "service") return t.serviceType ?? "Service";
  if (t.type === "sale") return t.saleCategory ?? "Sale";
  return t.expenseCategory ?? "Expense";
}

const APPROVED_STATUSES: TransactionStatus[] = ["approved", "settled", "adjusted"];

function matchesFilter(row: LedgerTransaction, f: QuickFilter) {
  if (f === "all") return true;
  if (f === "pending") return row.status === "pending";
  if (f === "approved") return APPROVED_STATUSES.includes(row.status);
  if (f === "disputed") return row.status === "disputed";
  return row.type === f;
}

function isEntryWorkflowFilter(f: QuickFilter): f is EntryKind {
  return f === "service" || f === "sale" || f === "expense";
}

function emptyLedgerCopy(
  filter: QuickFilter,
  providerView: boolean,
): { title: string; body: string; showEntryAction: boolean } {
  if (providerView) {
    switch (filter) {
      case "service":
        return {
          title: "No services recorded yet",
          body: "Start your day by logging the first service. Each entry gets an index number and stays pending until reconciliation.",
          showEntryAction: true,
        };
      case "pending":
        return {
          title: "Nothing pending review",
          body: "Services awaiting reconciliation will appear here once recorded.",
          showEntryAction: false,
        };
      case "approved":
        return {
          title: "No approved services yet",
          body: "Approved and settled services show here after reconciliation.",
          showEntryAction: false,
        };
      case "disputed":
        return {
          title: "No disputed services",
          body: "Disputed lines appear here when reconciliation needs follow-up.",
          showEntryAction: false,
        };
      default:
        return { title: "No services", body: "", showEntryAction: false };
    }
  }

  switch (filter) {
    case "service":
      return {
        title: "No services recorded yet",
        body: "Post the first service line to start the operational timeline for this lane.",
        showEntryAction: true,
      };
    case "sale":
      return {
        title: "No sales recorded yet",
        body: "Capture retail or product sales here when the lane is active.",
        showEntryAction: true,
      };
    case "expense":
      return {
        title: "No expenses recorded yet",
        body: "Log shop expenses here to keep the ledger complete.",
        showEntryAction: true,
      };
    case "pending":
      return {
        title: "Nothing pending review",
        body: "Entries awaiting reconciliation will appear in this view.",
        showEntryAction: false,
      };
    case "approved":
      return {
        title: "No approved entries",
        body: "Approved and settled lines show here after reconciliation.",
        showEntryAction: false,
      };
    case "disputed":
      return {
        title: "No disputed entries",
        body: "Disputed lines appear here when reconciliation needs follow-up.",
        showEntryAction: false,
      };
    default:
      return {
        title: "No transactions recorded yet",
        body: "The ledger stays empty until services, sales, and expenses are posted. Switch to a lane tab to record entries.",
        showEntryAction: false,
      };
  }
}

export function DailyLedgerPanel() {
  const { session } = useAuth();
  const providerView = isServiceProvider(session?.role);
  const canAddEntry = isManagerUp(session?.role);
  const filters = providerView ? PROVIDER_FILTERS : MANAGER_FILTERS;

  const { dismissByTransactionId } = useOpsNotifications();
  const [rows, setRows] = React.useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<QuickFilter>(providerView ? "service" : "all");
  const [review, setReview] = React.useState<LedgerTransaction | null>(null);

  const entryWorkflow = isEntryWorkflowFilter(filter);
  const showRecordService = providerView && filter === "service";
  const showManagerEntry = canAddEntry && entryWorkflow;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBarbershopLedger();
      let mapped = res.items.map(mapLedgerRow);
      if (providerView && session?.user_id) {
        mapped = mapped.filter(
          (r) => r.type === "service" && r.employeeId === session.user_id,
        );
      }
      setRows(mapped);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load ledger.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [providerView, session]);

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

  const description = providerView
    ? "Your service timeline. Record work as you go, then track pending and approved totals through reconciliation."
    : "Unified operational timeline. Filter by lane or control state, then drill into reconciliation without leaving the flow.";

  const emptyCopy = emptyLedgerCopy(filter, providerView);
  const refresh = () => void load();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">{description}</p>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((chip) => (
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
              {emptyCopy.title}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
              {emptyCopy.body}
            </p>
            {emptyCopy.showEntryAction && showRecordService ? (
              <div className="mt-6 flex justify-center">
                <RecordServiceFab variant="inline" onCreated={refresh} />
              </div>
            ) : null}
            {emptyCopy.showEntryAction && showManagerEntry && entryWorkflow ? (
              <div className="mt-6 flex justify-center">
                <AddEntryFab entryType={filter} variant="inline" onCreated={refresh} />
              </div>
            ) : null}
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
                      {!providerView ? (
                        <span className="rounded-md bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                          {t.type}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-base font-medium text-[var(--foreground)]">{typeLabel(t)}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted-foreground)]">
                      {!providerView && t.employeeName ? <span>{t.employeeName}</span> : null}
                      {!providerView && !t.employeeName ? <span>House</span> : null}
                      <span className="tabular-nums">{formatTimeLabel(t.createdAt)}</span>
                      {t.type === "expense" && t.paymentMethod ? (
                        <span>{formatExpensePaymentSource(t.paymentMethod) ?? t.paymentMethod}</span>
                      ) : t.paymentMethod ? (
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

      {showRecordService ? (
        <RecordServiceFab key="record-service" onCreated={refresh} />
      ) : null}
      {showManagerEntry && entryWorkflow ? (
        <AddEntryFab
          key={filter}
          entryType={filter}
          onCreated={refresh}
        />
      ) : null}
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
    r.payment_method === "cash" ||
    r.payment_method === "transfer" ||
    r.payment_method === "pos" ||
    r.payment_method === "cash_shop" ||
    r.payment_method === "admin_transfer"
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
