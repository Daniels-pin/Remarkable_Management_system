"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, updateUserAttendanceOffDays } from "@/lib/api";
import { WEEKDAY_FULL } from "@/lib/attendance";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  initialOffDays: number[];
  attendanceStartDate?: string | null;
  readOnly?: boolean;
  onSaved?: (offDays: number[], attendanceStartDate: string | null) => void;
};

function formatStartDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

export function AttendanceOffDaysEditor({
  userId,
  initialOffDays,
  attendanceStartDate = null,
  readOnly = false,
  onSaved,
}: Props) {
  const [selected, setSelected] = React.useState<number[]>(initialOffDays);
  const [startDate, setStartDate] = React.useState<string | null>(attendanceStartDate);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setStartDate(attendanceStartDate);
  }, [attendanceStartDate]);

  React.useEffect(() => {
    setSelected(initialOffDays);
  }, [initialOffDays]);

  const toggle = (day: number) => {
    if (readOnly || day === 6) return;
    setSelected((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await updateUserAttendanceOffDays(userId, selected);
      setStartDate(res.attendance_start_date);
      toast.success("Attendance schedule updated.");
      onSaved?.(res.attendance_off_days, res.attendance_start_date);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not save off-days.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-[var(--border)] shadow-[var(--shadow-card)]">
      <CardContent className="space-y-4 p-5">
        <div>
          <h3 className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
            Attendance off-days
          </h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            On selected days the employee is exempt from sign-in, lateness, and absence deductions.
            Sundays are always off globally. Saving also activates attendance tracking from today if not
            yet enabled.
          </p>
          {startDate ? (
            <p className="mt-2 text-sm text-[var(--foreground)]">
              Attendance tracking active from{" "}
              <span className="font-medium">{formatStartDate(startDate)}</span>. Dates before this are
              ignored for payroll deductions.
            </p>
          ) : (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              Attendance tracking not yet active — no lateness or absence deductions until you save.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_FULL.slice(0, 6).map((label, idx) => {
            const active = selected.includes(idx);
            return (
              <Button
                key={label}
                disabled={readOnly}
                size="sm"
                type="button"
                variant={active ? "default" : "outline"}
                className={cn(
                  "rounded-full",
                  active && "border-transparent bg-[var(--foreground)] text-[var(--background)]",
                )}
                onClick={() => toggle(idx)}
              >
                {label}
              </Button>
            );
          })}
          <Button disabled size="sm" type="button" variant="outline" className="rounded-full opacity-60">
            Sunday (global off)
          </Button>
        </div>

        {!readOnly ? (
          <Button
            className="rounded-full bg-[var(--foreground)] text-[var(--background)]"
            disabled={saving}
            type="button"
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save off-days"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
