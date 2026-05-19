"use client";

import * as React from "react";

import { AddEntryFab, type EntryKind } from "@/components/ops/add-entry-fab";
import { RecordServiceFab } from "@/components/ops/record-service-fab";
import { useAuth } from "@/components/providers/auth-provider";
import { CompactLedgerTable } from "@/components/ops/compact-ledger-table";
import { PendingVoidReview } from "@/components/ops/pending-void-review";
import {
  LedgerEntryEditDialog,
  type LedgerEditTarget,
} from "@/components/ops/ledger-entry-edit-dialog";
import {
  VoidConfirmDialog,
  type VoidConfirmContext,
  type VoidConfirmTarget,
} from "@/components/ops/void-confirm-dialog";
import { useOpsNotifications } from "@/components/ops/ops-notifications-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IndexedReconciliationTable } from "@/components/ops/indexed-reconciliation-table";
import { OperationalHistorySection } from "@/components/ops/operational-history-section";
import {
  MatchAllBar,
  MismatchDetailSheet,
  PendingMatchSheet,
  ReconciliationInboxTable,
} from "@/components/ops/reconciliation-inbox";
import {
  matchesReconciliationInboxFilter,
} from "@/lib/reconciliation-status";
import { OPERATIONAL_HISTORY_PAGE_SIZE } from "@/components/ops/ledger-month-controls";
import {
  ApiError,
  getBarberOperationalMonths,
  getBarberReconciliationWorkspace,
  listBarbershopLedger,
  listBarberPendingVoids,
  listReconciliationInbox,
  patchBarberServiceEntry,
  patchBarbershopLedgerEntry,
  voidBarberServiceEntry,
  voidBarbershopLedgerEntry,
  type LedgerRow,
  type PendingVoidRequest,
  type ReconciliationInboxRow,
  type ReconciliationWorkspaceRow,
} from "@/lib/api";
import { currentYearMonth } from "@/lib/ledger-month";
import { isManagerUp, isServiceProvider } from "@/lib/roles";
import type { LedgerEntryType, LedgerTransaction } from "@/lib/ops-types";
import { resolveTransactionStatus } from "@/lib/reconciliation-status";
import { toast } from "sonner";

type ManagerFilter =
  | "all"
  | LedgerEntryType
  | "pending"
  | "mismatch";

type ProviderFilter = "service" | "pending" | "mismatch";

const MANAGER_FILTERS: { id: ManagerFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "service", label: "Services" },
  { id: "sale", label: "Sales" },
  { id: "expense", label: "Expenses" },
  { id: "pending", label: "Pending" },
  { id: "mismatch", label: "Mismatch" },
];

const PROVIDER_FILTERS: { id: ProviderFilter; label: string }[] = [
  { id: "service", label: "Services" },
  { id: "pending", label: "Pending" },
  { id: "mismatch", label: "Mismatch" },
];

function isInboxFilter(f: ManagerFilter | ProviderFilter): f is "pending" | "mismatch" {
  return f === "pending" || f === "mismatch";
}

function isEntryWorkflowFilter(f: ManagerFilter): f is EntryKind {
  return f === "service" || f === "sale" || f === "expense";
}

function matchesManagerFilter(row: LedgerTransaction, f: ManagerFilter) {
  if (f === "all") return true;
  if (isInboxFilter(f)) return false;
  return row.type === f;
}

function filterWorkspaceRows(rows: ReconciliationWorkspaceRow[], f: ProviderFilter) {
  if (f === "service") return rows;
  return rows.filter((r) => matchesReconciliationInboxFilter(r.comparison_status, f));
}

function countInboxFromWorkspace(rows: ReconciliationWorkspaceRow[], f: "pending" | "mismatch") {
  return rows.filter((r) => matchesReconciliationInboxFilter(r.comparison_status, f)).length;
}

function emptyLedgerCopy(
  filter: ManagerFilter | ProviderFilter,
  role: "manager" | "provider",
): { title: string; body: string; showEntryAction: boolean } {
  switch (filter) {
    case "service":
      return {
        title: role === "provider" ? "No services recorded for this day" : "No services recorded yet",
        body:
          role === "provider"
            ? "Record a service to open your employee index."
            : "Post the first service line to start the operational timeline.",
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
        title: "Nothing pending",
        body: "Unmatched index entries appear here until both sides reconcile.",
        showEntryAction: false,
      };
    case "mismatch":
      return {
        title: "No mismatches",
        body: "Indexes where employee and manager amounts differ will appear here.",
        showEntryAction: false,
      };
    default:
      return {
        title: "No transactions recorded yet",
        body: "The ledger stays empty until services, sales, and expenses are posted.",
        showEntryAction: false,
      };
  }
}

function FilterChips<T extends string>({
  filters,
  active,
  counts,
  onChange,
}: {
  filters: { id: T; label: string }[];
  active: T;
  counts?: Partial<Record<T, number>>;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {filters.map((chip) => {
        const count = counts?.[chip.id];
        const label =
          count != null && count > 0 && (chip.id === "pending" || chip.id === "mismatch")
            ? `${chip.label} (${count})`
            : chip.label;
        return (
          <Button
            key={chip.id}
            type="button"
            size="sm"
            variant={active === chip.id ? "default" : "outline"}
            className={
              active === chip.id
                ? "rounded-full border-transparent bg-[var(--foreground)] text-[var(--background)]"
                : "rounded-full border-dashed"
            }
            onClick={() => onChange(chip.id)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}

function ProviderDailyLedger() {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [businessDate, setBusinessDate] = React.useState(today);
  const [dayRows, setDayRows] = React.useState<ReconciliationWorkspaceRow[]>([]);
  const [dayLoading, setDayLoading] = React.useState(true);
  const [canRecord, setCanRecord] = React.useState(true);
  const [filter, setFilter] = React.useState<ProviderFilter>("service");
  const [pendingVoids, setPendingVoids] = React.useState<PendingVoidRequest[]>([]);
  const [voidTarget, setVoidTarget] = React.useState<VoidConfirmTarget | null>(null);
  const [voidOpen, setVoidOpen] = React.useState(false);

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

  const loadPendingVoids = React.useCallback(async () => {
    try {
      const res = await listBarberPendingVoids();
      setPendingVoids(res.items);
    } catch {
      setPendingVoids([]);
    }
  }, []);

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
      void loadPendingVoids();
    });
  }, [loadDay, loadMonthGate, loadPendingVoids]);

  const requestVoidWorkspaceRow = (row: ReconciliationWorkspaceRow) => {
    const entryId = row.employee_entry_id ?? row.employee?.id;
    if (!entryId) return;
    const amount = Number(row.employee_amount ?? row.employee?.amount ?? row.amount ?? 0);
    setVoidTarget({
      id: entryId,
      index: row.index ?? 0,
      indexLabel: row.index_label ?? undefined,
      type: "service",
      amount: Number.isFinite(amount) ? amount : 0,
      description: row.service_name ?? "Service",
    });
    setVoidOpen(true);
  };

  const confirmProviderVoid = async (reason: string) => {
    if (!voidTarget) return;
    try {
      await voidBarberServiceEntry(voidTarget.id, reason);
      toast.success("Record voided.");
      await loadDay();
      await loadPendingVoids();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not void record.");
      throw e;
    }
  };

  const filteredRows = React.useMemo(
    () => filterWorkspaceRows(dayRows, filter),
    [dayRows, filter],
  );

  const inboxCounts = React.useMemo(
    () => ({
      pending: countInboxFromWorkspace(dayRows, "pending"),
      mismatch: countInboxFromWorkspace(dayRows, "mismatch"),
    }),
    [dayRows],
  );

  const emptyCopy = emptyLedgerCopy(filter, "provider");

  return (
    <div className="space-y-14">
      <PendingVoidReview
        items={pendingVoids}
        onResolved={() => {
          void loadDay();
          void loadPendingVoids();
        }}
      />

      <section className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
              Service entry
            </h3>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">
              Record services on your employee index stream. When your manager records the same
              index with a matching amount, it auto-confirms — otherwise it stays pending.
            </p>
          </div>
          <FilterChips
            filters={PROVIDER_FILTERS}
            active={filter}
            counts={inboxCounts}
            onChange={setFilter}
          />
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
          rows={filteredRows}
          loading={dayLoading}
          primarySide="employee"
          employeeColumnLabel="Your record"
          managerColumnLabel="Manager record"
          emptyTitle={emptyCopy.title}
          emptyBody={emptyCopy.body}
          onVoidRequest={requestVoidWorkspaceRow}
        />

        {canRecord && filter === "service" ? (
          <RecordServiceFab key="record-service" onCreated={() => void loadDay()} />
        ) : null}
      </section>

      <OperationalHistorySection mode="self" className="border-t border-[var(--border)]/60 pt-12" />

      <VoidConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        target={voidTarget}
        context="team_member_service"
        onConfirm={confirmProviderVoid}
      />
    </div>
  );
}

export function DailyLedgerPanel() {
  const { session } = useAuth();
  const providerView = isServiceProvider(session?.role);
  const canAddEntry = isManagerUp(session?.role);

  const { dismissByTransactionId } = useOpsNotifications();
  const [rows, setRows] = React.useState<LedgerTransaction[]>([]);
  const [inboxRows, setInboxRows] = React.useState<ReconciliationInboxRow[]>([]);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [mismatchCount, setMismatchCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<ManagerFilter>("all");
  const [selectedPending, setSelectedPending] = React.useState<ReconciliationInboxRow | null>(null);
  const [selectedMismatch, setSelectedMismatch] = React.useState<ReconciliationInboxRow | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<VoidConfirmTarget | null>(null);
  const [voidContext, setVoidContext] = React.useState<VoidConfirmContext>("manager_service");
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<LedgerEditTarget | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);

  const entryWorkflow = isEntryWorkflowFilter(filter);
  const showManagerEntry = canAddEntry && entryWorkflow;
  const inboxMode = isInboxFilter(filter);

  const load = React.useCallback(async () => {
    if (providerView) return;
    setLoading(true);
    try {
      const [ledgerRes, pendingRes, mismatchRes] = await Promise.all([
        listBarbershopLedger(),
        listReconciliationInbox("pending"),
        listReconciliationInbox("mismatch"),
      ]);
      setRows(ledgerRes.items.map(mapLedgerRow));
      setInboxRows(filter === "pending" ? pendingRes.items : mismatchRes.items);
      setPendingCount(pendingRes.total);
      setMismatchCount(mismatchRes.total);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load ledger.");
      setRows([]);
      setInboxRows([]);
    } finally {
      setLoading(false);
    }
  }, [providerView, filter]);

  const loadInboxOnly = React.useCallback(async () => {
    try {
      const res = await listReconciliationInbox(filter as "pending" | "mismatch");
      setInboxRows(res.items);
      if (filter === "pending") setPendingCount(res.total);
      if (filter === "mismatch") setMismatchCount(res.total);
      const other = await listReconciliationInbox(filter === "pending" ? "mismatch" : "pending");
      if (filter === "pending") setMismatchCount(other.total);
      else setPendingCount(other.total);
      const ledgerRes = await listBarbershopLedger();
      setRows(ledgerRes.items.map(mapLedgerRow));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }, [filter]);

  React.useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const sorted = React.useMemo(() => {
    return [...rows]
      .filter((r) => matchesManagerFilter(r, filter))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rows, filter]);

  const description = providerView
    ? "Your reconciliation workspace — record services, then browse indexed history by month."
    : "Official operational ledger — automatic matching when both sides align, or manual reconciliation from Pending.";

  const emptyCopy = emptyLedgerCopy(filter, "manager");
  const refresh = () => void load();

  const openEditDialog = (row: LedgerTransaction) => {
    const description =
      row.type === "service"
        ? row.serviceType ?? "Service"
        : row.type === "sale"
          ? row.saleCategory ?? "Sale"
          : row.expenseCategory ?? "Expense";
    setEditTarget({
      id: row.id,
      index: row.index,
      indexLabel: row.indexLabel,
      type: row.type,
      description,
      amount: row.amount,
      note: row.note,
    });
    setEditOpen(true);
  };

  const confirmEdit = async (data: { amount: number; note: string | null }) => {
    if (!editTarget) return;
    try {
      await patchBarbershopLedgerEntry(editTarget.id, {
        amount: data.amount,
        note: data.note,
      });
      toast.success("Record updated.");
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update record.");
      throw e;
    }
  };

  const openVoidDialog = (row: LedgerTransaction) => {
    const description =
      row.type === "service"
        ? row.serviceType ?? "Service"
        : row.type === "sale"
          ? row.saleCategory ?? "Sale"
          : row.expenseCategory ?? "Expense";
    setVoidContext(
      row.type === "sale"
        ? "sale"
        : row.type === "expense"
          ? "expense"
          : "manager_service",
    );
    setVoidTarget({
      id: row.id,
      index: row.index,
      indexLabel: row.indexLabel,
      type: row.type,
      amount: row.amount,
      description,
      employeeName: row.employeeName,
    });
    setVoidOpen(true);
  };

  const confirmManagerVoid = async (reason: string) => {
    if (!voidTarget) return;
    try {
      await voidBarbershopLedgerEntry(voidTarget.id, reason);
      const msg =
        voidContext === "manager_service"
          ? "Void request sent — employee must confirm before totals change."
          : "Record voided.";
      toast.success(msg);
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not void record.");
      throw e;
    }
  };

  const inboxCounts = { pending: pendingCount, mismatch: mismatchCount };

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
        <FilterChips
          filters={MANAGER_FILTERS}
          active={filter}
          counts={inboxCounts}
          onChange={setFilter}
        />
      </div>

      {inboxMode ? (
        <>
          <ReconciliationInboxTable
            rows={inboxRows}
            loading={loading}
            emptyTitle={emptyCopy.title}
            emptyBody={emptyCopy.body}
            onSelect={(row) => {
              if (filter === "pending") setSelectedPending(row);
              else setSelectedMismatch(row);
            }}
          />
          {filter === "pending" ? (
            <MatchAllBar pendingCount={pendingCount} onMatched={() => void loadInboxOnly()} />
          ) : null}
        </>
      ) : sorted.length === 0 && !loading ? (
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
          onVoid={openVoidDialog}
          onEdit={openEditDialog}
        />
      )}

      {showManagerEntry && entryWorkflow && !inboxMode ? (
        <AddEntryFab key={filter} entryType={filter} onCreated={refresh} />
      ) : null}

      <PendingMatchSheet
        row={selectedPending}
        open={Boolean(selectedPending)}
        onOpenChange={(o) => !o && setSelectedPending(null)}
        onMatched={() => void loadInboxOnly()}
      />
      <MismatchDetailSheet
        row={selectedMismatch}
        open={Boolean(selectedMismatch)}
        onOpenChange={(o) => !o && setSelectedMismatch(null)}
        onResolved={() => void loadInboxOnly()}
      />

      <VoidConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        target={voidTarget}
        context={voidContext}
        onConfirm={confirmManagerVoid}
      />

      <LedgerEntryEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        target={editTarget}
        onSave={confirmEdit}
      />
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
  const isVoided = r.is_voided ?? r.record_lifecycle === "deleted";
  const prev = r.original_amount ? Number(r.original_amount) : NaN;
  return {
    id: r.id,
    index: idx,
    type: r.entry_type,
    employeeName: r.employee_label,
    employeeId: r.employee_user_id,
    amount: Number.isFinite(amount) ? amount : 0,
    previousAmount: Number.isFinite(prev) && prev !== amount ? prev : undefined,
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
    indexLabel: r.index_label ?? undefined,
    recordLifecycle: r.record_lifecycle,
    isVoided,
    voidReason: r.void_reason,
    voidedByLabel: r.voided_by_label,
    voidedAt: r.voided_at,
    pendingVoidReason: r.pending_void_reason,
    pendingVoidByLabel: r.pending_void_by_label,
    canEdit: !isVoided && r.record_lifecycle === "active" && !r.pending_void_reason,
    canVoid: !isVoided && r.record_lifecycle === "active" && !r.pending_void_reason,
  };
}
