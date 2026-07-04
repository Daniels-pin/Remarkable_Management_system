"use client";

import * as React from "react";

import { DailyLedgerTeamAdvances } from "@/components/ops/daily-ledger-team-advances";
import { DailyLedgerPersonalConsumption } from "@/components/ops/daily-ledger-personal-consumption";
import { AddEntryFab, type EntryKind } from "@/components/ops/add-entry-fab";
import { RecordServiceFab } from "@/components/ops/record-service-fab";
import { useAuth } from "@/components/providers/auth-provider";
import { CompactLedgerTable } from "@/components/ops/compact-ledger-table";
import { DayLedgerSummary } from "@/components/ops/day-ledger-summary";
import { LedgerDateControls } from "@/components/ops/ledger-date-controls";
import { PendingVoidReview } from "@/components/ops/pending-void-review";
import {
  LedgerEntryEditDialog,
  type LedgerEditTarget,
} from "@/components/ops/ledger-entry-edit-dialog";
import {
  PaymentMethodCorrectionDialog,
  type PaymentMethodCorrectionTarget,
} from "@/components/ops/payment-method-correction-dialog";
import {
  VoidConfirmDialog,
  type VoidConfirmContext,
  type VoidConfirmTarget,
} from "@/components/ops/void-confirm-dialog";
import { useOpsNotifications } from "@/components/ops/ops-notifications-context";
import { useReconciliationCounts } from "@/components/ops/reconciliation-counts-context";
import { Button } from "@/components/ui/button";
import { OperationalAlertBadge } from "@/components/ui/operational-alert-badge";
import { IndexedReconciliationTable } from "@/components/ops/indexed-reconciliation-table";
import { OperationalHistorySection } from "@/components/ops/operational-history-section";
import {
  MatchAllBar,
  MismatchDetailSheet,
  PendingMatchSheet,
  ReconciliationInboxTable,
} from "@/components/ops/reconciliation-inbox";
import { OPERATIONAL_HISTORY_PAGE_SIZE } from "@/components/ops/ledger-month-controls";
import {
  ApiError,
  getBarberOperationalMonths,
  getBarberReconciliationWorkspace,
  listBarbershopLedger,
  listBarberPendingVoids,
  listBarberReconciliationInbox,
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
import { dispatchReconciliationUpdated } from "@/lib/reconciliation-events";
import type { LedgerEntryType, LedgerTransaction } from "@/lib/ops-types";
import { resolveTransactionStatus } from "@/lib/reconciliation-status";
import { correctionTargetFromLedgerTransaction } from "@/lib/payment-method-correction";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ManagerFilter =
  | "all"
  | LedgerEntryType
  | "team_advance"
  | "personal_consumption"
  | "pending"
  | "mismatch";

type ProviderFilter = "service" | "pending" | "mismatch";

const MANAGER_FILTERS: { id: ManagerFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "service", label: "Services" },
  { id: "sale", label: "Sales" },
  { id: "expense", label: "Expenses" },
  { id: "team_advance", label: "Team advance" },
  { id: "personal_consumption", label: "Personal consumption" },
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

function notifyReconciliationChanged() {
  dispatchReconciliationUpdated();
}

const MANAGER_PAGE_SIZE = 50;
const INBOX_PAGE_SIZE = 50;

function LedgerPagination({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
  noun = "records",
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  noun?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        {total} {total === 1 ? noun.replace(/s$/, "") : noun} · page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={page <= 1}
          onClick={onPrev}
        >
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={page >= totalPages}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function emptyLedgerCopy(
  filter: ManagerFilter | ProviderFilter,
  role: "manager" | "provider",
  opts: { viewingToday: boolean },
): { title: string; body: string; showEntryAction: boolean } {
  switch (filter) {
    case "service":
      return {
        title:
          role === "provider"
            ? opts.viewingToday
              ? "No services recorded today"
              : "No services recorded for this day"
            : opts.viewingToday
              ? "No services recorded today"
              : "No services recorded for this day",
        body:
          role === "provider"
            ? "Record a service to open your employee index."
            : "Post the first service line to start the operational timeline.",
        showEntryAction: true,
      };
    case "sale":
      return {
        title: opts.viewingToday ? "No sales recorded today" : "No sales recorded for this day",
        body: "Capture retail or product sales here when the lane is active.",
        showEntryAction: true,
      };
    case "expense":
      return {
        title: opts.viewingToday ? "No expenses recorded today" : "No expenses recorded for this day",
        body: "Log shop expenses here to keep the ledger complete.",
        showEntryAction: true,
      };
    case "team_advance":
      return {
        title: opts.viewingToday
          ? "No team advances recorded today"
          : "No team advances for this day",
        body: "Cash and product advances taken by team members appear here.",
        showEntryAction: false,
      };
    case "personal_consumption":
      return {
        title: opts.viewingToday
          ? "No personal consumption recorded today"
          : "No personal consumption for this day",
        body: "Products taken for personal use by admin or manager appear here.",
        showEntryAction: false,
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
        title: opts.viewingToday
          ? "No transactions recorded today"
          : "No transactions recorded",
        body: opts.viewingToday
          ? "This is expected — records appear here as services, sales, and expenses are posted."
          : "Nothing was posted on this business day.",
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
        const showAlertBadge =
          count != null &&
          count > 0 &&
          (chip.id === "pending" || chip.id === "mismatch");
        return (
          <Button
            key={chip.id}
            type="button"
            size="sm"
            variant={active === chip.id ? "default" : "outline"}
            className={cn(
              "gap-1.5",
              active === chip.id
                ? "rounded-full border-transparent bg-[var(--foreground)] text-[var(--background)]"
                : "rounded-full border-dashed",
              showAlertBadge && active !== chip.id && "border-rose-500/25",
            )}
            onClick={() => onChange(chip.id)}
          >
            <span>{chip.label}</span>
            {showAlertBadge ? (
              <OperationalAlertBadge
                count={count}
                className={cn(
                  active === chip.id && "bg-white/95 text-[#E5484D] shadow-none",
                )}
              />
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

function ProviderDailyLedger() {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const { pendingCount, mismatchCount, refreshCounts } = useReconciliationCounts();
  const [businessDate, setBusinessDate] = React.useState(today);
  const [dayRows, setDayRows] = React.useState<ReconciliationWorkspaceRow[]>([]);
  const [inboxRows, setInboxRows] = React.useState<ReconciliationWorkspaceRow[]>([]);
  const [dayTotal, setDayTotal] = React.useState(0);
  const [inboxTotal, setInboxTotal] = React.useState(0);
  const [dayPage, setDayPage] = React.useState(1);
  const [inboxPage, setInboxPage] = React.useState(1);
  const [dayLoading, setDayLoading] = React.useState(true);
  const [inboxLoading, setInboxLoading] = React.useState(false);
  const [canRecord, setCanRecord] = React.useState(true);
  const [filter, setFilter] = React.useState<ProviderFilter>("service");
  const [pendingVoids, setPendingVoids] = React.useState<PendingVoidRequest[]>([]);
  const [voidTarget, setVoidTarget] = React.useState<VoidConfirmTarget | null>(null);
  const [voidOpen, setVoidOpen] = React.useState(false);

  const inboxMode = filter === "pending" || filter === "mismatch";

  const loadDay = React.useCallback(async () => {
    setDayLoading(true);
    try {
      const res = await getBarberReconciliationWorkspace(
        businessDate,
        dayPage,
        OPERATIONAL_HISTORY_PAGE_SIZE,
      );
      setDayRows(res.items);
      setDayTotal(res.total);
      notifyReconciliationChanged();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      setDayRows([]);
      setDayTotal(0);
    } finally {
      setDayLoading(false);
    }
  }, [businessDate, dayPage]);

  const loadInbox = React.useCallback(async () => {
    if (!inboxMode) return;
    setInboxLoading(true);
    try {
      const res = await listBarberReconciliationInbox(filter, {
        page: inboxPage,
        pageSize: INBOX_PAGE_SIZE,
      });
      setInboxRows(res.items);
      setInboxTotal(res.total);
      notifyReconciliationChanged();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      setInboxRows([]);
      setInboxTotal(0);
    } finally {
      setInboxLoading(false);
    }
  }, [filter, inboxMode, inboxPage]);

  const loadDayCount = React.useCallback(async () => {
    try {
      const res = await getBarberReconciliationWorkspace(businessDate, 1, 1);
      setDayTotal(res.total);
    } catch {
      setDayTotal(0);
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
    setDayPage(1);
    setInboxPage(1);
  }, [businessDate, filter]);

  React.useEffect(() => {
    queueMicrotask(() => {
      if (inboxMode) {
        void loadInbox();
        void loadDayCount();
      } else {
        void loadDay();
      }
      void loadMonthGate();
      void loadPendingVoids();
    });
  }, [inboxMode, loadDay, loadInbox, loadDayCount, loadMonthGate, loadPendingVoids]);

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
      if (inboxMode) await loadInbox();
      else await loadDay();
      await loadPendingVoids();
      notifyReconciliationChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not void record.");
      throw e;
    }
  };

  const displayRows = inboxMode ? inboxRows : dayRows;
  const displayLoading = inboxMode ? inboxLoading : dayLoading;
  const displayTotal = inboxMode ? inboxTotal : dayTotal;
  const displayPage = inboxMode ? inboxPage : dayPage;
  const pageSize = inboxMode ? INBOX_PAGE_SIZE : OPERATIONAL_HISTORY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(displayTotal / pageSize));

  const inboxCounts = React.useMemo(
    () => ({
      pending: pendingCount,
      mismatch: mismatchCount,
    }),
    [pendingCount, mismatchCount],
  );

  const emptyCopy = emptyLedgerCopy(filter, "provider", { viewingToday: businessDate === today });

  const refreshProvider = () => {
    if (inboxMode) void loadInbox();
    else void loadDay();
    void refreshCounts();
  };

  return (
    <div className="space-y-14">
      <PendingVoidReview
        items={pendingVoids}
        onResolved={() => {
          refreshProvider();
          void loadPendingVoids();
          notifyReconciliationChanged();
        }}
      />

      <section className="space-y-5">
        <DayLedgerSummary
          transactionCount={dayTotal}
          pendingCount={pendingCount}
          mismatchCount={mismatchCount}
          businessDate={businessDate}
          today={today}
        />

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

        {!inboxMode ? (
          <div className="flex flex-wrap items-end gap-3">
            <LedgerDateControls
              value={businessDate}
              onChange={setBusinessDate}
              disabled={!canRecord}
            />
            {!canRecord ? (
              <p className="pb-2 text-xs text-[var(--muted-foreground)]">
                New entries are limited to the current operational month.
              </p>
            ) : null}
          </div>
        ) : null}

        <IndexedReconciliationTable
          rows={displayRows}
          loading={displayLoading}
          primarySide="employee"
          employeeColumnLabel="Your record"
          managerColumnLabel="Manager record"
          showBusinessDate={inboxMode}
          emptyTitle={emptyCopy.title}
          emptyBody={emptyCopy.body}
          onVoidRequest={inboxMode ? undefined : requestVoidWorkspaceRow}
        />

        <LedgerPagination
          page={displayPage}
          totalPages={totalPages}
          total={displayTotal}
          noun={inboxMode ? "unresolved records" : "indexed records"}
          onPrev={() =>
            inboxMode
              ? setInboxPage((p) => Math.max(1, p - 1))
              : setDayPage((p) => Math.max(1, p - 1))
          }
          onNext={() =>
            inboxMode
              ? setInboxPage((p) => Math.min(totalPages, p + 1))
              : setDayPage((p) => Math.min(totalPages, p + 1))
          }
        />

        {canRecord && filter === "service" ? (
          <RecordServiceFab
            key="record-service"
            onCreated={() => {
              void loadDay();
              void loadDayCount();
              void refreshCounts();
              notifyReconciliationChanged();
            }}
          />
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
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { dismissByTransactionId } = useOpsNotifications();
  const { pendingCount, mismatchCount, refreshCounts } = useReconciliationCounts();
  const [businessDate, setBusinessDate] = React.useState(today);
  const [rows, setRows] = React.useState<LedgerTransaction[]>([]);
  const [inboxRows, setInboxRows] = React.useState<ReconciliationInboxRow[]>([]);
  const [transactionTotal, setTransactionTotal] = React.useState(0);
  const [inboxTotal, setInboxTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [inboxPage, setInboxPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<ManagerFilter>("all");
  const [selectedPending, setSelectedPending] = React.useState<ReconciliationInboxRow | null>(null);
  const [selectedMismatch, setSelectedMismatch] = React.useState<ReconciliationInboxRow | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<VoidConfirmTarget | null>(null);
  const [voidContext, setVoidContext] = React.useState<VoidConfirmContext>("manager_service");
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<LedgerEditTarget | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [correctionTarget, setCorrectionTarget] =
    React.useState<PaymentMethodCorrectionTarget | null>(null);
  const [correctionOpen, setCorrectionOpen] = React.useState(false);

  const entryWorkflow = isEntryWorkflowFilter(filter);
  const teamAdvanceMode = filter === "team_advance";
  const personalConsumptionMode = filter === "personal_consumption";
  const showManagerEntry = canAddEntry && entryWorkflow;
  const inboxMode = isInboxFilter(filter);

  const loadTransactionCount = React.useCallback(async () => {
    try {
      const res = await listBarbershopLedger({
        businessDate,
        page: 1,
        pageSize: 1,
      });
      setTransactionTotal(res.total);
    } catch {
      setTransactionTotal(0);
    }
  }, [businessDate]);

  const load = React.useCallback(async () => {
    if (providerView) return;
    setLoading(true);
    try {
      if (inboxMode) {
        const res = await listReconciliationInbox(filter, {
          page: inboxPage,
          pageSize: INBOX_PAGE_SIZE,
        });
        setInboxRows(res.items);
        setInboxTotal(res.total);
        await loadTransactionCount();
      } else {
        const ledgerRes = await listBarbershopLedger({
          businessDate,
          page,
          pageSize: MANAGER_PAGE_SIZE,
        });
        setRows(ledgerRes.items.map(mapLedgerRow));
        setTransactionTotal(ledgerRes.total);
      }
      notifyReconciliationChanged();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load ledger.");
      if (inboxMode) {
        setInboxRows([]);
        setInboxTotal(0);
      } else {
        setRows([]);
        setTransactionTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [
    providerView,
    filter,
    businessDate,
    page,
    inboxPage,
    inboxMode,
    loadTransactionCount,
  ]);

  const loadInboxOnly = React.useCallback(async () => {
    try {
      const res = await listReconciliationInbox(filter as "pending" | "mismatch", {
        page: inboxPage,
        pageSize: INBOX_PAGE_SIZE,
      });
      setInboxRows(res.items);
      setInboxTotal(res.total);
      await refreshCounts();
      await loadTransactionCount();
      notifyReconciliationChanged();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }, [filter, inboxPage, refreshCounts, loadTransactionCount]);

  React.useEffect(() => {
    setPage(1);
    setInboxPage(1);
  }, [businessDate, filter]);

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
    : "Today's operational command center — review the selected day's transactions, then reconcile pending and mismatched indexes.";

  const emptyCopy = emptyLedgerCopy(filter, "manager", {
    viewingToday: businessDate === today,
  });
  const refresh = () => {
    void load();
    void refreshCounts();
  };

  const ledgerTotalPages = Math.max(1, Math.ceil(transactionTotal / MANAGER_PAGE_SIZE));
  const inboxTotalPages = Math.max(1, Math.ceil(inboxTotal / INBOX_PAGE_SIZE));

  const openCorrectionDialog = (row: LedgerTransaction) => {
    const target = correctionTargetFromLedgerTransaction(row);
    if (!target) return;
    setCorrectionTarget(target);
    setCorrectionOpen(true);
  };

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
      const res = await voidBarbershopLedgerEntry(voidTarget.id, reason);
      const msg = res.void_completed_immediately
        ? "Record voided."
        : voidContext === "manager_service"
          ? "Void request sent — employee must confirm before totals change."
          : "Record voided.";
      toast.success(msg);
      refresh();
      notifyReconciliationChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not void record.");
      throw e;
    }
  };

  const inboxCounts = { pending: pendingCount, mismatch: mismatchCount };

  if (providerView) {
    return (
      <div className="space-y-6">
        <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Today&apos;s service workspace — record on your index, then use Pending and Mismatch for
          all unresolved items regardless of date.
        </p>
        <ProviderDailyLedger />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DayLedgerSummary
        transactionCount={transactionTotal}
        pendingCount={pendingCount}
        mismatchCount={mismatchCount}
        businessDate={businessDate}
        today={today}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">{description}</p>
        <FilterChips
          filters={MANAGER_FILTERS}
          active={filter}
          counts={inboxCounts}
          onChange={setFilter}
        />
      </div>

      {!inboxMode && !teamAdvanceMode && !personalConsumptionMode ? (
        <LedgerDateControls value={businessDate} onChange={setBusinessDate} />
      ) : null}

      {!inboxMode && teamAdvanceMode ? (
        <>
          <LedgerDateControls value={businessDate} onChange={setBusinessDate} />
          <DailyLedgerTeamAdvances businessDate={businessDate} canManage={canAddEntry} />
        </>
      ) : !inboxMode && personalConsumptionMode ? (
        <>
          <LedgerDateControls value={businessDate} onChange={setBusinessDate} />
          <DailyLedgerPersonalConsumption businessDate={businessDate} canManage={canAddEntry} />
        </>
      ) : inboxMode ? (
        <>
          <ReconciliationInboxTable
            rows={inboxRows}
            loading={loading}
            emptyTitle={emptyCopy.title}
            emptyBody={emptyCopy.body}
            showMatchAction={filter === "pending"}
            onSelect={(row) => {
              if (filter === "pending") setSelectedPending(row);
              else setSelectedMismatch(row);
            }}
          />
          <LedgerPagination
            page={inboxPage}
            totalPages={inboxTotalPages}
            total={inboxTotal}
            noun="unresolved records"
            onPrev={() => setInboxPage((p) => Math.max(1, p - 1))}
            onNext={() => setInboxPage((p) => Math.min(inboxTotalPages, p + 1))}
          />
          {filter === "pending" ? (
            <MatchAllBar
              pendingCount={pendingCount}
              onMatched={() => {
                void loadInboxOnly();
                notifyReconciliationChanged();
              }}
            />
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
        <>
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
              notifyReconciliationChanged();
              void refreshCounts();
            }}
            onVoid={openVoidDialog}
            onEdit={openEditDialog}
            onCorrectPaymentMethod={openCorrectionDialog}
          />
          <LedgerPagination
            page={page}
            totalPages={ledgerTotalPages}
            total={transactionTotal}
            noun="transactions"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(ledgerTotalPages, p + 1))}
          />
        </>
      )}

      {showManagerEntry && entryWorkflow && !inboxMode ? (
        <AddEntryFab key={filter} entryType={filter} onCreated={refresh} />
      ) : null}

      <PendingMatchSheet
        row={selectedPending}
        open={Boolean(selectedPending)}
        onOpenChange={(o) => !o && setSelectedPending(null)}
        onMatched={() => {
          void loadInboxOnly();
          notifyReconciliationChanged();
        }}
        onVoidRequest={(row) => {
          const entryId = row.employee_entry_id;
          if (!entryId) return;
          const amount = Number(row.employee_amount ?? row.amount ?? 0);
          setVoidContext("grace_period_service");
          setVoidTarget({
            id: entryId,
            index: row.index ?? 0,
            indexLabel: row.index_label ?? undefined,
            type: "service",
            amount: Number.isFinite(amount) ? amount : 0,
            description: row.service_name ?? "Service",
            employeeName: row.employee_name,
          });
          setVoidOpen(true);
        }}
      />
      <MismatchDetailSheet
        row={selectedMismatch}
        open={Boolean(selectedMismatch)}
        onOpenChange={(o) => !o && setSelectedMismatch(null)}
        onResolved={() => {
          void loadInboxOnly();
          notifyReconciliationChanged();
        }}
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

      <PaymentMethodCorrectionDialog
        target={correctionTarget}
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        onCorrected={() => {
          refresh();
          notifyReconciliationChanged();
        }}
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
  const ps = r.product_sale;
  return {
    id: r.id,
    index: idx,
    type: r.entry_type,
    employeeName:
      r.entry_type === "sale"
        ? (ps?.recorded_by_label ?? r.created_by_label)
        : r.employee_label,
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
    businessDate: r.business_date,
    approvedAt: r.approved_at ?? undefined,
    reconciledAt: r.reconciled_at ?? undefined,
    serviceType: r.service_type?.name ?? undefined,
    saleCategory: r.sale_category?.name ?? undefined,
    expenseCategory: r.expense_category?.name ?? undefined,
    productSale: ps
      ? {
          productName: ps.product_name ?? "Product",
          quantity: ps.quantity,
          recordedByLabel: ps.recorded_by_label ?? r.created_by_label,
          unitSellingPrice: Number(ps.unit_selling_price),
          revenue: Number(ps.revenue),
        }
      : undefined,
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
    paymentMethodAdjustments: r.payment_method_adjustments,
  };
}
