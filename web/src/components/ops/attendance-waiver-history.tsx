"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, listAttendanceWaivers, type AttendanceWaiverRow } from "@/lib/api";
import {
  attendanceStatusLabel,
  attendanceStatusTone,
  currentAttendanceMonth,
  monthPickerOptions,
} from "@/lib/attendance";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AttendanceWaiverHistoryPanel() {
  const initialMonth = currentAttendanceMonth();
  const [year, setYear] = React.useState(initialMonth.year);
  const [month, setMonth] = React.useState(initialMonth.month);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [items, setItems] = React.useState<AttendanceWaiverRow[]>([]);
  const pageSize = 10;
  const months = React.useMemo(() => monthPickerOptions(18), []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAttendanceWaivers({ year, month, page, page_size: pageSize });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [year, month, page]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
            Attendance waiver history
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Audit trail of individual and bulk penalty waivers.
          </p>
        </div>
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
      </div>

      <Card className="border-[var(--border)] shadow-[var(--shadow-card)]">
        <CardContent className="p-0">
          {loading ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted-foreground)]">
              No waivers recorded for this month.
            </p>
          ) : (
            <ul>
              {items.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-[var(--border)]/70 px-4 py-3.5 last:border-b-0"
                >
                  <div className="min-w-[8.5rem] shrink-0">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {new Date(row.business_date).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    {row.waived_at ? (
                      <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                        Approved{" "}
                        {new Date(row.waived_at).toLocaleString("en-NG", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {row.employee_name ?? "Employee"}
                    </p>
                    <p className={cn("mt-0.5 text-xs font-medium", attendanceStatusTone(row.status))}>
                      {attendanceStatusLabel(row.status, true)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">{row.waiver_reason}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {row.waived_by_name ?? "Admin"}
                    </p>
                    <p className="mt-0.5 text-sm tabular-nums text-[var(--foreground)]/80">
                      {formatNaira(Number(row.original_deduction_amount || 0))}
                    </p>
                    <span className="mt-1 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-200">
                      Waived By Admin
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            Page {page} of {totalPages} · {total} waivers
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
    </section>
  );
}
