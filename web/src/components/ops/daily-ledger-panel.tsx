"use client";

import * as React from "react";

import { AddEntryFab, type EntryKind } from "@/components/ops/add-entry-fab";
import { RecordServiceFab } from "@/components/ops/record-service-fab";
import { useAuth } from "@/components/providers/auth-provider";
import { CompactLedgerTable } from "@/components/ops/compact-ledger-table";
import { useOpsNotifications } from "@/components/ops/ops-notifications-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IndexedReconciliationTable } from "@/components/ops/indexed-reconciliation-table";
import { OperationalHistorySection } from "@/components/ops/operational-history-section";
import {
  matchesReconciliationFilter,
  resolveTransactionStatus,
} from "@/lib/reconciliation-status";
import { OPERATIONAL_HISTORY_PAGE_SIZE } from "@/components/ops/ledger-month-controls";
import {
  ApiError,
  getBarberOperationalMonths,
  getBarberReconciliationWorkspace,
  listBarbershopLedger,
  type LedgerRow,
  type ReconciliationWorkspaceRow,
} from "@/lib/api";
import { currentYearMonth } from "@/lib/ledger-month";
import { isManagerUp, isServiceProvider } from "@/lib/roles";
import type { LedgerEntryType, LedgerTransaction } from "@/lib/ops-types";
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

function matchesFilter(row: LedgerTransaction, f: QuickFilter) {
  if (f === "all") return true;
  if (f === "pending" || f === "approved" || f === "disputed") {
    return matchesReconciliationFilter(row.status, f);
  }
  return row.type === f;
}

function isEntryWorkflowFilter(f: QuickFilter): f is EntryKind {
  return f === "service" || f === "sale" || f === "expense";
}

function emptyLedgerCopy(
  filter: QuickFilter,
): { title: string; body: string; showEntryAction: boolean } {
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

function ProviderDailyLedger() {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [businessDate, setBusinessDate] = React.useState(today);
  const [dayRows, setDayRows] = React.useState<ReconciliationWorkspaceRow[]>([]);
  const [dayLoading, setDayLoading] = React.useState(true);
  const [canRecord, setCanRecord] = React.useState(true);

  const loadDay = React.useCallback(async () => {
    setDayLoading(true);
    try {
      const res = await getBarberReconciliationWorkspace(
        businessDate,
        1,
        OPERATIONAL_HISTORY_PAGE_SIZE,
      );
      setDayRows(res.items);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      setDayRows([]);
    } finally {
      setDayLoading(false);
    }
  }, [businessDate]);

  const loadMonthGate = React.useCallback(async () => {
    try {
      const res = await getBarberOperationalMonths();
      const current = res.items?.find((m) => m.is_current);
      const now = currentYearMonth();
      setCanRecord(
        current ? current.year === now.year && current.month === now.month : true,
      );
    } catch {
      setCanRecord(true);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => {
      void loadDay();
      void loadMonthGate();
    });
  }, [loadDay, loadMonthGate]);

  const refresh = () => {
    void loadDay();
  };

  return (
    <div className="space-y-14">
      <section className="space-y-5">
        <div className="space-y-1">
          <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
            Service entry
          </h3>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Record today&apos;s services on your employee index stream. Your manager records an
            independent index at the same position when they verify — compared side by side, never merged.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ledger-day" className="text-xs">
              Business day
            </Label>
            <Input
              id="ledger-day"
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="h-9 w-44"
              disabled={!canRecord}
            />
          </div>
          {!canRecord ? (
            <p className="pb-2 text-xs text-[var(--muted-foreground)]">
              New entries are limited to the current operational month.
            </p>
          ) : null}
        </div>

        <IndexedReconciliationTable
          rows={dayRows}
          loading={dayLoading}
          primarySide="employee"
          employeeColumnLabel="Your record"
          managerColumnLabel="Manager record"
          emptyTitle="No services recorded for this day"
          emptyBody="Record a service to open your employee index. Your manager records an independent index at the same position when they verify."
        />

        {canRecord ? <RecordServiceFab key="record-service" onCreated={refresh} /> : null}
      </section>

      <OperationalHistorySection mode="self" className="border-t border-[var(--border)]/60 pt-12" />
    </div>
  );
}

export function DailyLedgerPanel() {
  const { session } = useAuth();
  const providerView = isServiceProvider(session?.role);
  const canAddEntry = isManagerUp(session?.role);

  const { dismissByTransactionId } = useOpsNotifications();
  const [rows, setRows] = React.useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<QuickFilter>("all");
  const entryWorkflow = isEntryWorkflowFilter(filter);
  const showManagerEntry = canAddEntry && entryWorkflow;

  const load = React.useCallback(async () => {
    if (providerView) return;
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
  }, [providerView]);

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
    ? "Your reconciliation workspace — record services, then browse indexed history by month."
    : "Official operational ledger — manager-verified service lines, sales, and expenses.";

  const emptyCopy = emptyLedgerCopy(filter);
  const refresh = () => void load();

  if (providerView) {
    return (
      <div className="space-y-6">
        <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">{description}</p>
        <ProviderDailyLedger />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">{description}</p>
        <div className="flex flex-wrap gap-1.5">
          {MANAGER_FILTERS.map((chip) => (
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

      {sorted.length === 0 && !loading ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)] px-6 py-16 text-center shadow-[var(--shadow-card)] md:px-10">
          <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
            {emptyCopy.title}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
            {emptyCopy.body}
          </p>
          {emptyCopy.showEntryAction && showManagerEntry && entryWorkflow ? (
            <div className="mt-6 flex justify-center">
              <AddEntryFab entryType={filter} variant="inline" onCreated={refresh} />
            </div>
          ) : null}
        </div>
      ) : (
        <CompactLedgerTable
          rows={sorted}
          loading={loading}
          emptyTitle={emptyCopy.title}
          emptyBody={emptyCopy.body}
          onReconciliationAccept={(id) => {
            dismissByTransactionId(id);
            setRows((prev) =>
              prev.map((r) =>
                r.id === id ? { ...r, status: "approved" as const, reconciliation: undefined } : r,
              ),
            );
          }}
        />
      )}

      {showManagerEntry && entryWorkflow ? (
        <AddEntryFab key={filter} entryType={filter} onCreated={refresh} />
      ) : null}
    </div>
  );
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
    status: resolveTransactionStatus({
      entryType: r.entry_type,
      comparisonStatus: r.comparison_status,
      workflowStatus: r.reconciliation_status,
    }),
    createdAt: r.occurred_at,
    serviceType: r.service_type?.name ?? undefined,
    saleCategory: r.sale_category?.name ?? undefined,
    expenseCategory: r.expense_category?.name ?? undefined,
    reconciliation: undefined,
    comparisonStatus: r.comparison_status ?? undefined,
  };
}
