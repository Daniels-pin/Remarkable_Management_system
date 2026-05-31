"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { TeamMemberProfileView } from "@/components/ops/barber-profile-view";
import { AttendanceHistoryPanel } from "@/components/ops/attendance-history-panel";
import { AttendanceOffDaysEditor } from "@/components/ops/attendance-off-days-editor";
import { OperationalHistorySection } from "@/components/ops/operational-history-section";
import { ManagerTeamMemberSummary } from "@/components/ops/manager-team-member-summary";
import {
  MonthPostureSummary,
  type MonthPostureData,
} from "@/components/ops/month-posture-summary";
import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { useAuth } from "@/components/providers/auth-provider";
import {
  ApiError,
  type CommissionStatementRow,
  type ReconciliationPosture,
  getDirectoryTeamMember,
  getDirectoryTeamMemberMonthStats,
  getUserAttendanceHistory,
  listCommissionStatements,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { normalizePayoutBreakdown, resolveActualPayout } from "@/lib/payout";
import { subscribePayoutUpdated } from "@/lib/payout-events";
import { isAdmin } from "@/lib/roles";
import type { PayoutAttendanceBreakdown } from "@/components/ops/payout-with-attendance";
import type { TeamMemberProfile } from "@/lib/ops-types";

type TeamProfileVM = TeamMemberProfile & {
  reconciliationPosture: ReconciliationPosture;
  monthPosture: MonthPostureData;
  monthPayoutBreakdown?: PayoutAttendanceBreakdown;
};

export default function TeamMemberDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { session } = useAuth();
  const adminView = isAdmin(session?.role);

  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<TeamProfileVM | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [detail, monthStats] = await Promise.all([
        getDirectoryTeamMember(id),
        getDirectoryTeamMemberMonthStats(id),
      ]);

      if (!detail.found || !detail.member) {
        setProfile(null);
        return;
      }

      const m = detail.member;
      const name = m.full_name?.trim() || `@${m.username}`;
      const initials =
        m.full_name
          ?.trim()
          ?.split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0])
          .join("")
          .toUpperCase() || m.username.slice(0, 2).toUpperCase();

      const commissionPct = m.commission_pct ? Number(m.commission_pct) : 0;
      const expectedPayout = Number(monthStats.expected_payout_on_approved ?? 0);
      const deductionsTotal = Number(monthStats.attendance_deductions_total ?? 0);
      const actualPayout = resolveActualPayout(
        expectedPayout,
        monthStats.actual_payout_on_approved != null
          ? Number(monthStats.actual_payout_on_approved)
          : null,
        deductionsTotal,
      );

      setProfile({
        id: m.id,
        displayName: name,
        initials,
        email: m.email,
        phone: m.phone ?? "—",
        bankName: m.bank_name ?? "Not on file",
        accountNumber: m.account_number ?? "—",
        accountName: m.account_name ?? "—",
        commissionPct,
        salaryType: (m.salary_type || "commission").replace(/_/g, " "),
        fixedSalary: m.fixed_salary ? Number(m.fixed_salary) : null,
        role: m.role,
        avatarUrl: null,
        monthStats: {
          revenue: Number(monthStats.current_month_gross_recorded ?? 0),
          services: Number(monthStats.current_month_services_count ?? 0),
          approved: Number(monthStats.approved_total ?? 0),
          pending: Number(monthStats.pending_total ?? 0),
          payout: adminView ? actualPayout : 0,
        },
        monthPayoutBreakdown: adminView
          ? normalizePayoutBreakdown({
              expectedPayout,
              actualPayout,
              attendanceDeductionsTotal: deductionsTotal,
              lateDeductionsTotal: Number(monthStats.attendance_late_deductions_total ?? 0),
              absenceDeductionsTotal: Number(monthStats.attendance_absence_deductions_total ?? 0),
            })
          : undefined,
        allTimeStats: {
          revenue: Number(monthStats.all_time_gross_recorded ?? 0),
          services: Number(monthStats.all_time_services_count ?? 0),
          approved: adminView ? Number(monthStats.all_time_approved_total ?? 0) : undefined,
          payout: adminView ? Number(monthStats.all_time_commission_total ?? 0) : 0,
        },
        reconciliationPosture: monthStats.reconciliation_posture ?? "clear",
        monthPosture: {
          pendingTotal: Number(monthStats.pending_total ?? 0),
          approvedTotal: Number(monthStats.approved_total ?? 0),
          mismatchIndexes: monthStats.mismatch_indexes ?? [],
        },
      });
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load team member profile.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [id, adminView]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  React.useEffect(() => subscribePayoutUpdated(() => void load()), [load]);

  if (!profile && !loading) {
    return (
      <BarbershopShell title="Team" subtitle="Profile not found.">
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No team member matches this link.</p>
          <Link
            href="/barbershop/team"
            className="mt-4 inline-flex h-8 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-transparent px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            Back to team
          </Link>
        </div>
      </BarbershopShell>
    );
  }

  if (!profile) {
    return (
      <BarbershopShell title="Team" subtitle="Loading profile…">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--muted-foreground)]">Loading profile…</p>
        </div>
      </BarbershopShell>
    );
  }

  const subtitle = adminView
    ? "Personal details, financial summaries, and operational history."
    : "Operational supervision, service verification, and reconciliation tracking.";

  return (
    <BarbershopShell title={profile.displayName} subtitle={subtitle}>
      <div className="mb-6">
        <Link
          href="/barbershop/team"
          className="inline-flex h-8 items-center rounded-full px-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← Team
        </Link>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--muted-foreground)]">Refreshing…</p>
        </div>
      ) : adminView ? (
        <AdminTeamMemberBody profile={profile} memberId={id} />
      ) : (
        <ManagerTeamMemberBody profile={profile} memberId={id} />
      )}
    </BarbershopShell>
  );
}

function ManagerTeamMemberBody({
  profile,
  memberId,
}: {
  profile: TeamProfileVM;
  memberId: string;
}) {
  return (
    <div className="space-y-12">
      <ManagerTeamMemberSummary
        displayName={profile.displayName}
        initials={profile.initials}
        role={profile.role}
        email={profile.email}
        phone={profile.phone}
        monthRevenue={profile.monthStats.revenue}
        monthServices={profile.monthStats.services}
        reconciliationPosture={profile.reconciliationPosture}
        monthPosture={profile.monthPosture}
      />

      {profile.role !== "manager" ? (
        <OperationalHistorySection
          mode="team"
          memberId={memberId}
          memberName={profile.displayName}
          primarySide="manager"
          employeeColumnLabel="Employee record"
          managerColumnLabel="Manager record"
          className="border-t border-[var(--border)]/60 pt-12"
        />
      ) : null}

      <AttendanceHistoryPanel managementMode showSummary title="Attendance" userId={memberId} />
    </div>
  );
}

function AdminTeamMemberBody({
  profile,
  memberId,
}: {
  profile: TeamProfileVM;
  memberId: string;
}) {
  const [statements, setStatements] = React.useState<CommissionStatementRow[]>([]);
  const [offDays, setOffDays] = React.useState<number[]>([]);
  const [attendanceStartDate, setAttendanceStartDate] = React.useState<string | null>(null);

  const loadAdminSections = React.useCallback(async () => {
    try {
      const [commissionRes, attendanceRes] = await Promise.all([
        listCommissionStatements(),
        getUserAttendanceHistory(memberId, { page: 1, page_size: 1 }),
      ]);
      setStatements(
        (commissionRes.items ?? []).filter((s) => String(s.user_id) === String(memberId)),
      );
      setOffDays(attendanceRes.user.attendance_off_days ?? []);
      setAttendanceStartDate(attendanceRes.user.attendance_start_date ?? null);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }, [memberId]);

  React.useEffect(() => {
    queueMicrotask(() => void loadAdminSections());
  }, [loadAdminSections]);

  const payouts = statements.map((s) => ({
    id: s.id,
    periodLabel: s.financial_month_id,
    amount: Number(s.commission_amount ?? 0),
    status: s.payout_state === "paid" ? "paid" : "pending",
    paidAt: s.payout_payment_date,
  }));

  return (
    <div className="space-y-12">
      <TeamMemberProfileView
        profile={profile}
        variant="full"
        monthPayoutBreakdown={profile.monthPayoutBreakdown}
      />
      {profile.role !== "manager" ? <OperationalPostureSection profile={profile} /> : null}

      <AttendanceOffDaysEditor
        attendanceStartDate={attendanceStartDate}
        initialOffDays={offDays}
        userId={memberId}
        onSaved={(days, start) => {
          setOffDays(days);
          setAttendanceStartDate(start);
        }}
      />

      <AttendanceHistoryPanel managementMode showSummary title="Attendance" userId={memberId} />

      {(profile.role === "barber" || payouts.length > 0) && (
        <section className="space-y-4">
          <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
            {profile.role === "barber" ? "Payout history" : "Compensation history"}
          </h3>
          {payouts.length === 0 ? (
            <EmptyPanel message="No payroll runs recorded yet." />
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{p.periodLabel}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {p.status === "paid" && p.paidAt ? `Paid ${p.paidAt}` : "Pending"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatNaira(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {profile.role !== "manager" ? (
        <OperationalHistorySection
          mode="team"
          memberId={memberId}
          memberName={profile.displayName}
          primarySide="manager"
          employeeColumnLabel="Employee record"
          managerColumnLabel="Manager record"
          className="border-t border-[var(--border)]/60 pt-12"
        />
      ) : null}
    </div>
  );
}

function OperationalPostureSection({ profile }: { profile: TeamProfileVM }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
          Financial summary
        </h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Index reconciliation for the current month — approved totals, pending value, and mismatched
          indexes for this team member only.
        </p>
      </div>
      <MonthPostureSummary data={profile.monthPosture} />
    </section>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
      {message}
    </div>
  );
}

