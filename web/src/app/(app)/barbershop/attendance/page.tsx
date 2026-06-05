"use client";

import * as React from "react";

import { AttendanceBulkWaiverModal, AttendanceIndividualWaiverModal } from "@/components/ops/attendance-waiver-modals";
import { AttendanceHistoryPanel } from "@/components/ops/attendance-history-panel";
import { AttendanceWaivedTodayCard } from "@/components/ops/attendance-waived-today-card";
import { AttendanceWaiverHistoryPanel } from "@/components/ops/attendance-waiver-history";
import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { listAttendanceTeamRoster, type AttendanceRecordRow } from "@/lib/api";
import {
  attendanceStatusLabel,
  attendanceStatusTone,
  canWaiveRecord,
  todayIsoDate,
} from "@/lib/attendance";
import { isAdmin, isManagerUp } from "@/lib/roles";
import { cn } from "@/lib/utils";

type RosterMember = {
  id: string;
  username: string;
  full_name: string | null;
  role: string;
  today_status: string | null;
  today_record?: AttendanceRecordRow | null;
};

export default function AttendancePage() {
  const { session } = useAuth();
  const managementView = isManagerUp(session?.role);
  const adminView = isAdmin(session?.role);
  const [roster, setRoster] = React.useState<RosterMember[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [waivedTodayCount, setWaivedTodayCount] = React.useState(0);
  const [businessDate, setBusinessDate] = React.useState(todayIsoDate());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [rosterWaiverTarget, setRosterWaiverTarget] = React.useState<RosterMember | null>(null);

  const loadRoster = React.useCallback(async () => {
    if (!managementView) return;
    try {
      const res = await listAttendanceTeamRoster();
      setRoster(res.items);
      setWaivedTodayCount(res.waived_today_count ?? 0);
      setBusinessDate(res.business_date ?? todayIsoDate());
      if (res.items.length > 0) {
        setSelectedUserId((current) => current ?? res.items[0]?.id ?? null);
      }
    } catch {
      setRoster([]);
      setWaivedTodayCount(0);
    }
  }, [managementView]);

  React.useEffect(() => {
    void loadRoster();
  }, [loadRoster, refreshKey]);

  const selectedMember = roster.find((member) => member.id === selectedUserId) ?? null;

  const subtitle = managementView
    ? "Team attendance archive — lateness, absences, and deduction totals."
    : "Your attendance history, lateness, and payroll deductions.";

  const historyTitle =
    managementView && selectedMember
      ? `${selectedMember.full_name?.trim() || `@${selectedMember.username}`} — attendance`
      : managementView
        ? "Employee attendance"
        : "Your attendance";

  function handleWaiverApplied() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <BarbershopShell subtitle={subtitle} title="Attendance">
      <div className="space-y-10">
        {adminView ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
                  Admin actions
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Excuse attendance penalties for operational exceptions.
                </p>
              </div>
              <Button className="rounded-full" type="button" onClick={() => setBulkOpen(true)}>
                Waive All
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AttendanceWaivedTodayCard
                count={waivedTodayCount}
                businessDate={businessDate}
                onRefresh={() => void loadRoster()}
              />
            </div>
          </section>
        ) : null}

        {managementView ? (
          <section className="space-y-4">
            <div>
              <h2 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
                Team roster
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Today&apos;s status across barbers, staff, and managers.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roster.map((member) => {
                const name = member.full_name?.trim() || `@${member.username}`;
                const active = selectedUserId === member.id;
                const record = member.today_record;
                const waived = Boolean(record?.is_waived);
                const showWaive =
                  adminView &&
                  record != null &&
                  canWaiveRecord(record);

                return (
                  <div
                    key={member.id}
                    className={cn(
                      "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-card)] transition",
                      active && "ring-1 ring-[var(--foreground)]/20",
                    )}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setSelectedUserId(member.id)}
                    >
                      <p className="text-sm font-medium text-[var(--foreground)]">{name}</p>
                      <p className="text-[11px] capitalize text-[var(--muted-foreground)]">{member.role}</p>
                      <p className={cn("mt-2 text-xs font-medium", attendanceStatusTone(member.today_status))}>
                        Today: {attendanceStatusLabel(member.today_status, waived)}
                      </p>
                      {waived ? (
                        <span className="mt-2 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-200">
                          Waived By Admin
                        </span>
                      ) : null}
                    </button>
                    {showWaive ? (
                      <Button
                        className="mt-3 w-full rounded-full"
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => setRosterWaiverTarget(member)}
                      >
                        Waive Attendance
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {adminView ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                Configure off-days on each employee&apos;s Team profile. Attendance settings live under
                Settings → Attendance.
              </p>
            ) : null}
          </section>
        ) : null}

        <AttendanceHistoryPanel
          adminMode={adminView}
          employeeName={
            selectedMember?.full_name?.trim() || (selectedMember ? `@${selectedMember.username}` : undefined)
          }
          managementMode={managementView}
          refreshKey={refreshKey}
          title={historyTitle}
          userId={managementView ? (selectedUserId ?? undefined) : undefined}
        />

        {adminView ? <AttendanceWaiverHistoryPanel /> : null}
      </div>

      {adminView ? (
        <>
          <AttendanceBulkWaiverModal
            open={bulkOpen}
            defaultDate={businessDate}
            onOpenChange={setBulkOpen}
            onApplied={handleWaiverApplied}
          />
          {rosterWaiverTarget ? (
            <AttendanceIndividualWaiverModal
              open={Boolean(rosterWaiverTarget)}
              onOpenChange={(open) => {
                if (!open) setRosterWaiverTarget(null);
              }}
              userId={rosterWaiverTarget.id}
              employeeName={rosterWaiverTarget.full_name?.trim() || `@${rosterWaiverTarget.username}`}
              businessDate={businessDate}
              onApplied={handleWaiverApplied}
            />
          ) : null}
        </>
      ) : null}
    </BarbershopShell>
  );
}
