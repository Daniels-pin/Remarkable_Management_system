"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ApiError,
  getMyAttendanceHistory,
  getUserAttendanceHistory,
  type AttendanceRecordRow,
} from "@/lib/api";
import {
  attendanceStatusLabel,
  attendanceStatusTone,
  currentAttendanceMonth,
  EMPTY_ATTENDANCE_SUMMARY,
  monthPickerOptions,
  normalizeAttendanceSummary,
} from "@/lib/attendance";
import { formatNaira, formatTimeLabel } from "@/lib/format";
import { subscribePayoutUpdated } from "@/lib/payout-events";
import { cn } from "@/lib/utils";

type Props = {
  userId?: string;
  /** When true, loads a specific employee via userId — never the signed-in admin /me route. */
  managementMode?: boolean;
  showSummary?: boolean;
  title?: string;
  linkToFull?: boolean;
};

export function AttendanceHistoryPanel({
  userId,
  managementMode = false,
  showSummary = true,
  title = "Attendance history",
  linkToFull = false,
}: Props) {
  const initialMonth = currentAttendanceMonth();
  const [year, setYear] = React.useState(initialMonth.year);
  const [month, setMonth] = React.useState(initialMonth.month);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [items, setItems] = React.useState<AttendanceRecordRow[]>([]);
  const [summary, setSummary] = React.useState(EMPTY_ATTENDANCE_SUMMARY);
  const pageSize = 10;
  const months = React.useMemo(() => monthPickerOptions(18), []);

  const needsEmployeeSelection = managementMode && !userId;

  const load = React.useCallback(async () => {
    if (needsEmployeeSelection) {
      setLoading(false);
      setItems([]);
      setTotal(0);
      setSummary(EMPTY_ATTENDANCE_SUMMARY);
      return;
    }

    setLoading(true);
    try {
      const res = userId
        ? await getUserAttendanceHistory(userId, { year, month, page, page_size: pageSize })
        : await getMyAttendanceHistory({ year, month, page, page_size: pageSize });
      setItems(res.items);
      setTotal(res.total);
      setSummary(normalizeAttendanceSummary(res.summary));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      setItems([]);
      setTotal(0);
      setSummary(EMPTY_ATTENDANCE_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [needsEmployeeSelection, managementMode, userId, year, month, page]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  React.useEffect(() => subscribePayoutUpdated(() => void load()), [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
            {title}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Lateness, absences, and payroll deductions by month.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
            value={`${year}-${month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setYear(y);
              setMonth(m);
              setPage(1);
            }}
          >
            {months.map((opt) => (
              <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                {opt.label}
              </option>
            ))}
          </select>
          {linkToFull ? (
            <Link
              href="/barbershop/attendance"
              className="inline-flex h-8 items-center justify-center rounded-full border border-[var(--border)] bg-transparent px-3 text-sm font-medium hover:bg-[var(--muted)]"
            >
              Full archive
            </Link>
          ) : null}
        </div>
      </div>

      {showSummary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Late deductions", value: summary.late_deductions_total },
            { label: "Absence deductions", value: summary.absence_deductions_total },
            { label: "Total attendance deductions", value: summary.total_deductions, emphasis: true },
          ].map((row) => (
            <Card key={row.label} className="border-[var(--border)] shadow-[var(--shadow-card)]">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  {row.label}
                </p>
                <p
                  className={cn(
                    "mt-1 text-lg font-semibold tabular-nums",
                    row.emphasis ? "text-[var(--foreground)]" : "text-[var(--foreground)]/90",
                  )}
                >
                  {formatNaira(Number(row.value || 0))}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="border-[var(--border)] shadow-[var(--shadow-card)]">
        <CardContent className="p-0">
          {needsEmployeeSelection ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted-foreground)]">
              Select a team member above to view their attendance history and deductions.
            </p>
          ) : loading ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted-foreground)]">
              No attendance records for this month.
            </p>
          ) : (
            <ul>
              {items.map((row) => {
                const deduction = Number(row.deduction_amount || 0);
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border)]/70 px-4 py-3.5 last:border-b-0 sm:flex-nowrap"
                  >
                    <div className="min-w-[8.5rem] shrink-0">
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {new Date(row.business_date).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", attendanceStatusTone(row.status))}>
                        {attendanceStatusLabel(row.status)}
                      </p>
                      {row.signed_in_at ? (
                        <p className="mt-0.5 text-xs tabular-nums text-[var(--muted-foreground)]">
                          {formatTimeLabel(row.signed_in_at)}
                        </p>
                      ) : null}
                    </div>
                    <div className="ml-auto shrink-0 text-right">
                      {deduction > 0 ? (
                        <>
                          <p className="text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-200">
                            {formatNaira(deduction)}
                          </p>
                          <p className="text-[10px] capitalize text-[var(--muted-foreground)]">
                            {row.deduction_reason ?? "attendance"} deduction
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-[var(--muted-foreground)]">—</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            Page {page} of {totalPages} · {total} records
          </p>
          <div className="flex gap-2">
            <Button
              disabled={page <= 1 || loading}
              size="sm"
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              disabled={page >= totalPages || loading}
              size="sm"
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
