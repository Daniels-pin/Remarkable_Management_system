"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { ReconciliationComparisonBadge } from "@/components/ops/reconciliation-comparison-badge";
import type { ReconciliationComparisonStatus } from "@/components/ops/reconciliation-comparison-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  getDirectoryTeamMemberReconciliationWorkspace,
  type ReconciliationWorkspaceRow,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

function EntryCell({
  label,
  amount,
  serviceName,
  missing,
}: {
  label: string | null;
  amount: string | null;
  serviceName: string;
  missing: boolean;
}) {
  if (missing || (!label && !amount)) {
    return (
      <p className="text-sm italic text-[var(--muted-foreground)]">Not recorded</p>
    );
  }
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-[var(--foreground)]">{serviceName}</p>
      <p className="font-[family-name:var(--font-serif)] text-base font-semibold tabular-nums text-[var(--foreground)]">
        {amount ? formatNaira(Number(amount)) : "—"}
      </p>
    </div>
  );
}

function rowHighlight(status: ReconciliationComparisonStatus | string): string {
  switch (status) {
    case "mismatch":
    case "disputed":
      return "bg-rose-500/[0.04] hover:bg-rose-500/[0.07]";
    case "missing_employee_entry":
    case "missing_manager_entry":
      return "bg-amber-500/[0.04] hover:bg-amber-500/[0.07]";
    case "matched":
    case "settled":
      return "hover:bg-[var(--muted)]/20";
    default:
      return "hover:bg-[var(--muted)]/15";
  }
}

export function EmployeeReconciliationWorkspace({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [businessDate, setBusinessDate] = React.useState(today);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<ReconciliationWorkspaceRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [dailyStatus, setDailyStatus] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    try {
      const res = await getDirectoryTeamMemberReconciliationWorkspace(memberId, {
        date: businessDate,
        page,
        page_size: PAGE_SIZE,
      });
      setRows(res.items);
      setTotal(res.total);
      setDailyStatus(res.daily_summary_status ?? null);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load reconciliation workspace.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [memberId, businessDate, page]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [businessDate]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
            Service reconciliation
          </h3>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Compare {memberName}&apos;s submitted services with your official ledger lines, indexed
            per business day for fast verification.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rec-day" className="text-xs">
              Business day
            </Label>
            <Input
              id="rec-day"
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="h-9 w-44"
            />
          </div>
          <Link
            href="/barbershop/reconciliation"
            className="inline-flex h-8 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-transparent px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            Open reconciliation desk
          </Link>
        </div>
      </div>

      {dailyStatus ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Day summary status ·{" "}
          <span className="font-medium text-[var(--foreground)]">
            {dailyStatus.replace(/_/g, " ")}
          </span>
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)] shadow-[var(--shadow-card)]">
        <div className="hidden border-b border-[var(--border)]/80 bg-[var(--muted)]/30 px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)] md:grid md:grid-cols-[5rem_1fr_1fr_8.5rem] md:gap-4 lg:px-6">
          <span>Index</span>
          <span>Employee entry</span>
          <span>Manager ledger</span>
          <span className="text-right">Status</span>
        </div>

        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-[var(--muted-foreground)]">
            Loading indexed entries…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
              No service entries for this day
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
              When the employee records services or you add official lines, they will appear here
              with index numbers for side-by-side comparison.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]/80">
            {rows.map((row) => {
              const status = row.comparison_status as ReconciliationComparisonStatus;
              const employeeMissing =
                status === "missing_employee_entry" || row.employee_amount === null;
              const managerMissing =
                status === "missing_manager_entry" || row.manager_amount === null;

              return (
                <li
                  key={row.id}
                  className={cn(
                    "grid gap-4 px-4 py-4 transition-colors md:grid-cols-[5rem_1fr_1fr_8.5rem] md:items-center lg:px-6",
                    rowHighlight(status),
                  )}
                >
                  <p className="font-mono text-sm font-medium tabular-nums text-[var(--muted-foreground)]">
                    {row.index_label ?? "—"}
                  </p>
                  <EntryCell
                    label={row.employee_label}
                    amount={row.employee_amount}
                    serviceName={row.service_name}
                    missing={employeeMissing}
                  />
                  <EntryCell
                    label={row.manager_label}
                    amount={row.manager_amount}
                    serviceName={row.service_name}
                    missing={managerMissing}
                  />
                  <div className="flex md:justify-end">
                    <ReconciliationComparisonBadge status={status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {total > 0 ? (
        <WorkspacePagination
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

function WorkspacePagination({
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
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        {total} indexed {total === 1 ? "entry" : "entries"} · page {page} of {totalPages}
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
