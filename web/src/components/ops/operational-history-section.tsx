"use client";

import * as React from "react";
import { toast } from "sonner";

import { IndexedReconciliationTable } from "@/components/ops/indexed-reconciliation-table";
import {
  LedgerMonthControls,
  OPERATIONAL_HISTORY_PAGE_SIZE,
  type OperationalMonthOption,
} from "@/components/ops/ledger-month-controls";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  getBarberReconciliationHistory,
  getBarberOperationalMonths,
  getDirectoryTeamMemberReconciliationHistory,
  getDirectoryTeamMemberOperationalMonths,
  type ReconciliationWorkspaceRow,
} from "@/lib/api";
import { currentYearMonth, monthDisplayLabel, type YearMonth } from "@/lib/ledger-month";

export type OperationalHistoryMode = "self" | "team";

export function OperationalHistorySection({
  mode,
  memberId,
  memberName,
  employeeColumnLabel = "Your record",
  managerColumnLabel = "Manager record",
  primarySide,
  title = "Indexed operational history",
  subtitle,
  className,
}: {
  mode: OperationalHistoryMode;
  memberId?: string;
  memberName?: string;
  employeeColumnLabel?: string;
  managerColumnLabel?: string;
  primarySide?: "employee" | "manager";
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  const [selectedMonth, setSelectedMonth] = React.useState<YearMonth>(() => currentYearMonth());
  const [archiveMonths, setArchiveMonths] = React.useState<OperationalMonthOption[]>([]);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<ReconciliationWorkspaceRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [readOnly, setReadOnly] = React.useState(false);
  const [isCurrentMonth, setIsCurrentMonth] = React.useState(true);
  const viewerSide = primarySide ?? (mode === "team" ? "manager" : "employee");

  const loadMonths = React.useCallback(async () => {
    try {
      if (mode === "self") {
        const res = await getBarberOperationalMonths();
        setArchiveMonths(res.items ?? []);
      } else if (memberId) {
        const res = await getDirectoryTeamMemberOperationalMonths(memberId);
        setArchiveMonths(res.items ?? []);
      }
    } catch {
      setArchiveMonths([]);
    }
  }, [mode, memberId]);

  const loadHistory = React.useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "team" && !memberId) return;
      const opts = {
        year: selectedMonth.year,
        month: selectedMonth.month,
        page,
        page_size: OPERATIONAL_HISTORY_PAGE_SIZE,
      };
      const res =
        mode === "self"
          ? await getBarberReconciliationHistory(opts)
          : await getDirectoryTeamMemberReconciliationHistory(memberId!, opts);
      setRows(res.items ?? []);
      setTotal(res.total ?? 0);
      setReadOnly(Boolean(res.read_only));
      setIsCurrentMonth(Boolean(res.is_current_month));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load operational history.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [mode, memberId, selectedMonth, page]);

  React.useEffect(() => {
    queueMicrotask(() => void loadMonths());
  }, [loadMonths]);

  React.useEffect(() => {
    queueMicrotask(() => void loadHistory());
  }, [loadHistory]);

  React.useEffect(() => {
    setPage(1);
  }, [selectedMonth.year, selectedMonth.month]);

  const totalPages = Math.max(1, Math.ceil(total / OPERATIONAL_HISTORY_PAGE_SIZE));
  const defaultSubtitle =
    mode === "self"
      ? "Your indexed reconciliation feed — each row pairs your submission with the manager's official record."
      : `Indexed reconciliation for ${memberName ?? "this team member"} — employee vs manager comparison by service index.`;

  return (
    <section className={className}>
      <div className="mb-6 space-y-2">
        <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
          {title}
        </h3>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          {subtitle ?? defaultSubtitle}
        </p>
        {readOnly ? (
          <p className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-1 text-[11px] font-medium tracking-wide text-[var(--muted-foreground)]">
            Read-only · {monthDisplayLabel(selectedMonth)} is historical review
          </p>
        ) : isCurrentMonth ? (
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Current operational month · {monthDisplayLabel(selectedMonth)}
          </p>
        ) : null}
      </div>

      <LedgerMonthControls
        selected={selectedMonth}
        onSelect={setSelectedMonth}
        archiveMonths={archiveMonths}
        className="mb-6"
      />

      <IndexedReconciliationTable
        rows={rows}
        loading={loading}
        showBusinessDate
        primarySide={viewerSide}
        employeeColumnLabel={employeeColumnLabel}
        managerColumnLabel={managerColumnLabel}
        emptyTitle={`No indexed entries for ${monthDisplayLabel(selectedMonth)}`}
        emptyBody={
          mode === "self"
            ? "Services you record this month will appear here with index numbers and reconciliation status."
            : "When this employee records services or you add official lines, indexed rows appear here."
        }
      />

      {total > 0 ? (
        <HistoryPagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      ) : null}
    </section>
  );
}

function HistoryPagination({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        {total} indexed {total === 1 ? "record" : "records"} · page {page} of {totalPages}
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
