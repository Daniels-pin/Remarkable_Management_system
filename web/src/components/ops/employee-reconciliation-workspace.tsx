"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { IndexedReconciliationTable } from "@/components/ops/indexed-reconciliation-table";
import { OPERATIONAL_HISTORY_PAGE_SIZE } from "@/components/ops/ledger-month-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  getDirectoryTeamMemberReconciliationWorkspace,
  type ReconciliationWorkspaceRow,
} from "@/lib/api";

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
        page_size: OPERATIONAL_HISTORY_PAGE_SIZE,
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

  const totalPages = Math.max(1, Math.ceil(total / OPERATIONAL_HISTORY_PAGE_SIZE));

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
            Day reconciliation
          </h3>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Scan {memberName}&apos;s indexed lines for {businessDate}. Click a row to expand audit
            details.
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
            Reconciliation desk
          </Link>
        </div>
      </div>

      {dailyStatus ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          Day summary ·{" "}
          <span className="font-medium text-[var(--foreground)]">
            {dailyStatus.replace(/_/g, " ")}
          </span>
        </p>
      ) : null}

      <IndexedReconciliationTable
        rows={rows}
        loading={loading}
        primarySide="manager"
        employeeColumnLabel="Employee record"
        managerColumnLabel="Manager record"
        emptyTitle="No entries for this day"
        emptyBody="Services and official lines appear here with compact index rows for side-by-side review."
      />

      {total > 0 ? (
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
