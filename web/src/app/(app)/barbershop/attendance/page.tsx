"use client";

import * as React from "react";

import { AttendanceHistoryPanel } from "@/components/ops/attendance-history-panel";
import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { listAttendanceTeamRoster } from "@/lib/api";
import { cn } from "@/lib/utils";
import { attendanceStatusLabel, attendanceStatusTone } from "@/lib/attendance";
import { isAdmin, isManagerUp } from "@/lib/roles";

type RosterMember = {
  id: string;
  username: string;
  full_name: string | null;
  role: string;
  today_status: string | null;
};

export default function AttendancePage() {
  const { session } = useAuth();
  const managementView = isManagerUp(session?.role);
  const adminView = isAdmin(session?.role);
  const [roster, setRoster] = React.useState<RosterMember[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!managementView) return;
    void listAttendanceTeamRoster()
      .then((res) => {
        setRoster(res.items);
        if (res.items.length > 0) {
          setSelectedUserId((current) => current ?? res.items[0]?.id ?? null);
        }
      })
      .catch(() => setRoster([]));
  }, [managementView]);

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

  return (
    <BarbershopShell subtitle={subtitle} title="Attendance">
      <div className="space-y-10">
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
                return (
                  <button
                    key={member.id}
                    type="button"
                    className={cn(
                      "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]",
                      active && "ring-1 ring-[var(--foreground)]/20",
                    )}
                    onClick={() => setSelectedUserId(member.id)}
                  >
                    <p className="text-sm font-medium text-[var(--foreground)]">{name}</p>
                    <p className="text-[11px] capitalize text-[var(--muted-foreground)]">{member.role}</p>
                    <p className={cn("mt-2 text-xs font-medium", attendanceStatusTone(member.today_status))}>
                      Today: {attendanceStatusLabel(member.today_status)}
                    </p>
                  </button>
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
          managementMode={managementView}
          title={historyTitle}
          userId={managementView ? (selectedUserId ?? undefined) : undefined}
        />
      </div>
    </BarbershopShell>
  );
}
