"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  waiveAllAttendance,
  waiveUserAttendance,
} from "@/lib/api";
import { WAIVER_REASON_PRESETS, todayIsoDate } from "@/lib/attendance";
import { dispatchPayoutUpdated } from "@/lib/payout-events";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BulkProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  onApplied: () => void;
};

export function AttendanceBulkWaiverModal({
  open,
  onOpenChange,
  defaultDate,
  onApplied,
}: BulkProps) {
  const [businessDate, setBusinessDate] = React.useState(defaultDate ?? todayIsoDate());
  const [reasonPreset, setReasonPreset] = React.useState<string>(WAIVER_REASON_PRESETS[0]);
  const [customReason, setCustomReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setBusinessDate(defaultDate ?? todayIsoDate());
    setReasonPreset(WAIVER_REASON_PRESETS[0]);
    setCustomReason("");
  }, [open, defaultDate]);

  const reason = customReason.trim() || reasonPreset;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("A waiver reason is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await waiveAllAttendance({ business_date: businessDate, reason: reason.trim() });
      toast.success(res.message);
      dispatchPayoutUpdated();
      onApplied();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not apply waiver.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waive all attendance penalties</DialogTitle>
          <DialogDescription>
            Remove late and absence deductions for every employee on the selected day. Attendance
            history is preserved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)}>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-waiver-date">Date</Label>
              <Input
                id="bulk-waiver-date"
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-waiver-reason">Reason</Label>
              <select
                id="bulk-waiver-reason"
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                value={reasonPreset}
                onChange={(e) => setReasonPreset(e.target.value)}
              >
                {WAIVER_REASON_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Or enter a custom reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            </div>
          </DialogBody>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
            <Button disabled={saving} type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? "Applying…" : "Apply Waiver"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type IndividualProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  employeeName: string;
  businessDate: string;
  onApplied: () => void;
};

export function AttendanceIndividualWaiverModal({
  open,
  onOpenChange,
  userId,
  employeeName,
  businessDate,
  onApplied,
}: IndividualProps) {
  const [reasonPreset, setReasonPreset] = React.useState<string>(WAIVER_REASON_PRESETS[0]);
  const [customReason, setCustomReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setReasonPreset(WAIVER_REASON_PRESETS[0]);
    setCustomReason("");
  }, [open]);

  const reason = customReason.trim() || reasonPreset;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("A waiver reason is required.");
      return;
    }
    setSaving(true);
    try {
      await waiveUserAttendance(userId, { business_date: businessDate, reason: reason.trim() });
      toast.success("Attendance penalty waived.");
      dispatchPayoutUpdated();
      onApplied();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not apply waiver.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waive attendance</DialogTitle>
          <DialogDescription>
            Remove penalties for this employee while keeping their attendance record.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)}>
          <DialogBody className="space-y-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 text-sm">
              <p className="font-medium text-[var(--foreground)]">{employeeName}</p>
              <p className="mt-1 text-[var(--muted-foreground)]">
                {new Date(businessDate).toLocaleDateString("en-NG", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="individual-waiver-reason">Reason</Label>
              <select
                id="individual-waiver-reason"
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                value={reasonPreset}
                onChange={(e) => setReasonPreset(e.target.value)}
              >
                {WAIVER_REASON_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Or enter a custom reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            </div>
          </DialogBody>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
            <Button disabled={saving} type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? "Applying…" : "Apply Waiver"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
