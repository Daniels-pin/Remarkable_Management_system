"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  MapPinned,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ApiError,
  getTodayAttendance,
  signInAttendance,
  type AttendanceRecordRow,
  type AttendanceTodayResponse,
} from "@/lib/api";
import {
  attendanceStatusLabel,
  attendanceStatusTone,
  formatLateTime,
  formatLatenessDuration,
  latenessMinutes,
} from "@/lib/attendance";
import { formatNaira, formatTimeLabel } from "@/lib/format";
import { dispatchPayoutUpdated } from "@/lib/payout-events";
import { resolveActualPayout } from "@/lib/payout";
import { cn } from "@/lib/utils";

function useGeolocation() {
  const [coords, setCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device.");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Could not read your location.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  return { coords, error, loading, refresh };
}

function AttendanceExpandedDetails({
  record,
  lateTime,
}: {
  record: AttendanceRecordRow;
  lateTime?: string;
}) {
  const signedAt = record.signed_in_at ? formatTimeLabel(record.signed_in_at) : "—";
  const deduction = Number(record.deduction_amount || 0);
  const waived = Boolean(record.is_waived);
  const originalDeduction = Number(record.original_deduction_amount || 0);
  const lateMins =
    record.signed_in_at && lateTime && record.status === "late"
      ? latenessMinutes(record.signed_in_at, lateTime)
      : null;

  return (
    <dl className="grid gap-2 border-t border-[var(--border)]/70 pt-3 text-xs sm:grid-cols-2">
      <div>
        <dt className="text-[var(--muted-foreground)]">Sign-in time</dt>
        <dd className="mt-0.5 font-medium tabular-nums">{signedAt}</dd>
      </div>
      <div>
        <dt className="text-[var(--muted-foreground)]">Status</dt>
        <dd className={cn("mt-0.5 font-medium", attendanceStatusTone(record.status))}>
          {attendanceStatusLabel(record.status, waived)}
        </dd>
      </div>
      {lateTime ? (
        <div>
          <dt className="text-[var(--muted-foreground)]">Cutoff time</dt>
          <dd className="mt-0.5 font-medium">{formatLateTime(lateTime)}</dd>
        </div>
      ) : null}
      {lateMins != null ? (
        <div>
          <dt className="text-[var(--muted-foreground)]">Lateness</dt>
          <dd className="mt-0.5 font-medium">{formatLatenessDuration(lateMins)}</dd>
        </div>
      ) : null}
      {waived ? (
        <div>
          <dt className="text-[var(--muted-foreground)]">Deduction</dt>
          <dd className="mt-0.5 font-medium text-emerald-700 dark:text-emerald-300">
            {formatNaira(originalDeduction)} waived
          </dd>
        </div>
      ) : deduction > 0 ? (
        <div>
          <dt className="text-[var(--muted-foreground)]">Deduction</dt>
          <dd className="mt-0.5 font-medium text-amber-800 dark:text-amber-200">
            {formatNaira(deduction)}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

type Props = {
  className?: string;
  onUpdated?: () => void;
};

export function AttendanceSignInCard({ className, onUpdated }: Props) {
  const [ctx, setCtx] = React.useState<AttendanceTodayResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [signingIn, setSigningIn] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const geo = useGeolocation();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTodayAttendance();
      setCtx(res);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  React.useEffect(() => {
    if (ctx?.can_sign_in) {
      geo.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once when sign-in becomes available
  }, [ctx?.can_sign_in]);

  const handleSignIn = async () => {
    if (!geo.coords) {
      geo.refresh();
      toast.error("Waiting for location — allow access and try again.");
      return;
    }
    setSigningIn(true);
    try {
      const res = await signInAttendance({
        latitude: geo.coords.lat,
        longitude: geo.coords.lng,
      });
      toast.success("Attendance signed in.");
      await load();
      if (res.payout) {
        const expected = Number(res.payout.expected_payout_on_approved);
        const deductions = Number(res.payout.attendance_deductions_total);
        dispatchPayoutUpdated({
          expectedPayout: expected,
          actualPayout: resolveActualPayout(
            expected,
            res.payout.actual_payout_on_approved != null
              ? Number(res.payout.actual_payout_on_approved)
              : null,
            deductions,
          ),
          attendanceDeductionsTotal: deductions,
        });
      } else {
        dispatchPayoutUpdated();
      }
      onUpdated?.();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Sign-in failed.");
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          "flex h-11 items-center rounded-[var(--radius-md)] border border-[var(--border)]/90 bg-[var(--card)] px-3 text-xs text-[var(--muted-foreground)]",
          className,
        )}
      >
        Loading attendance…
      </div>
    );
  }

  if (ctx?.exempt) return null;

  const record = ctx?.record ?? null;
  const isSunday = ctx?.is_sunday;
  const isOffDay = ctx?.is_off_day;
  const trackingActive = ctx?.attendance_tracking_active !== false;
  const canExpand = Boolean(record);

  const rowTone = record
    ? record.status === "late"
      ? "border-amber-500/25 bg-amber-500/[0.04]"
      : "border-emerald-500/20 bg-emerald-500/[0.03]"
    : ctx?.can_sign_in
      ? "border-[var(--foreground)]/15 bg-[var(--card)]"
      : "border-[var(--border)]/90 bg-[var(--card)]";

  return (
    <div className={cn("space-y-0", className)}>
      <div
        className={cn(
          "overflow-hidden rounded-[var(--radius-md)] border shadow-[var(--shadow-card)]",
          rowTone,
        )}
      >
        {record ? (
          <button
            type="button"
            className="flex w-full min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-left text-xs sm:flex-nowrap sm:gap-4"
            onClick={() => canExpand && setExpanded((v) => !v)}
          >
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--foreground)]">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Signed in
            </span>
            <span className="tabular-nums text-[var(--foreground)]">
              {record.signed_in_at ? formatTimeLabel(record.signed_in_at) : "—"}
            </span>
            <span className={cn("font-medium", attendanceStatusTone(record.status))}>
              {attendanceStatusLabel(record.status, Boolean(record.is_waived))}
            </span>
            {Boolean(record.is_waived) ? (
              <span className="text-emerald-700 dark:text-emerald-300">Waived By Admin</span>
            ) : Number(record.deduction_amount) > 0 ? (
              <span className="text-amber-800 dark:text-amber-200">
                {formatNaira(Number(record.deduction_amount))} penalty
              </span>
            ) : null}
            <span className="ml-auto text-[var(--muted-foreground)]">Today</span>
            {canExpand ? (
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform",
                  expanded && "rotate-180",
                )}
              />
            ) : null}
          </button>
        ) : isSunday ? (
          <div className="flex min-h-11 items-center gap-2 px-3 py-2 text-xs text-[var(--muted-foreground)]">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Sunday — shop closed · no attendance</span>
          </div>
        ) : isOffDay ? (
          <div className="flex min-h-11 items-center gap-2 px-3 py-2 text-xs text-[var(--muted-foreground)]">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Off day · attendance not required</span>
          </div>
        ) : !trackingActive ? (
          <div className="flex min-h-11 items-center gap-2 px-3 py-2 text-xs text-[var(--muted-foreground)]">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            <span>Attendance tracking not active for your account yet</span>
          </div>
        ) : ctx?.can_sign_in ? (
          <div className="flex min-h-11 flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap sm:gap-3">
            <span className="text-xs font-medium text-[var(--foreground)]">Sign in</span>
            <span className="hidden text-xs text-[var(--muted-foreground)] sm:inline">
              · within {ctx.radius_meters ?? "—"}m
              {ctx.late_time ? ` · late after ${formatLateTime(ctx.late_time)}` : ""}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[10px] text-[var(--muted-foreground)] sm:max-w-[40%]">
              {geo.loading ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <MapPinned className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">
                {geo.coords ? "Location ready" : geo.error || "Detecting location…"}
              </span>
            </span>
            <Button
              className="ml-auto h-8 shrink-0 rounded-full px-4 text-xs"
              disabled={signingIn || geo.loading}
              size="sm"
              type="button"
              onClick={() => void handleSignIn()}
            >
              {signingIn ? "…" : "Sign in"}
            </Button>
          </div>
        ) : (
          <div className="flex min-h-11 items-center gap-2 px-3 py-2 text-xs text-[var(--muted-foreground)]">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            <span>Attendance unavailable</span>
          </div>
        )}

        {record && expanded ? (
          <div className="px-3 pb-3">
            <AttendanceExpandedDetails lateTime={ctx?.late_time} record={record} />
          </div>
        ) : null}

        {ctx?.can_sign_in && !record ? (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 border-t border-[var(--border)]/60 py-1 text-[10px] text-[var(--muted-foreground)] sm:hidden"
            onClick={() => setExpanded((v) => !v)}
          >
            {ctx.late_time ? `Late after ${formatLateTime(ctx.late_time)}` : "Details"}
            <ChevronDown className={cn("h-3 w-3", expanded && "rotate-180")} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
