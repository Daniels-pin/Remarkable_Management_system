"use client";

import * as React from "react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, listWaiversForDay, type AttendanceWaiverRow } from "@/lib/api";
import { attendanceStatusLabel, attendanceStatusTone } from "@/lib/attendance";
import { cn } from "@/lib/utils";

type Props = {
  count: number;
  businessDate?: string;
  onRefresh?: () => void;
};

export function AttendanceWaivedTodayCard({ count, businessDate, onRefresh }: Props) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<AttendanceWaiverRow[]>([]);

  React.useEffect(() => {
    onRefresh?.();
  }, [count, onRefresh]);

  async function openDetails() {
    setOpen(true);
    setLoading(true);
    try {
      const res = await listWaiversForDay(businessDate);
      setItems(res.items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load waivers.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => void openDetails()}
        disabled={count <= 0}
      >
        <Card
          className={cn(
            "border-[var(--border)] shadow-[var(--shadow-card)] transition",
            count > 0 && "hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]",
          )}
        >
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              Waived today
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]">{count}</p>
            {count > 0 ? (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Tap to view details</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">No waivers for today</p>
            )}
          </CardContent>
        </Card>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Waived today</DialogTitle>
            <DialogDescription>
              Employees whose attendance penalties were waived for this business day.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="p-0">
            {loading ? (
              <p className="px-6 py-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-[var(--muted-foreground)]">
                No waivers for this day.
              </p>
            ) : (
              <ul>
                {items.map((row) => (
                  <li
                    key={row.id}
                    className="border-b border-[var(--border)]/70 px-6 py-3.5 last:border-b-0"
                  >
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {row.employee_name ?? "Employee"}
                    </p>
                    <p className={cn("mt-0.5 text-xs font-medium", attendanceStatusTone(row.status))}>
                      {attendanceStatusLabel(row.status, true)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">{row.waiver_reason}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                      Approved by {row.waived_by_name ?? "Admin"} ·{" "}
                      {new Date(row.business_date).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
