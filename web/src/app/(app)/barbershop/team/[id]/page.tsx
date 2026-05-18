"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { TeamMemberProfileView } from "@/components/ops/barber-profile-view";
import { EmployeeReconciliationWorkspace } from "@/components/ops/employee-reconciliation-workspace";
import { ManagerTeamMemberSummary } from "@/components/ops/manager-team-member-summary";
import { StatusBadge } from "@/components/ops/status-badge";
import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { useAuth } from "@/components/providers/auth-provider";
import {
  ApiError,
  type CommissionStatementRow,
  type DirectoryBarberLedgerRow,
  type DirectoryBarberReconciliationRow,
  type ReconciliationPosture,
  getDirectoryTeamMember,
  getDirectoryTeamMemberMonthStats,
  listCommissionStatements,
  listDirectoryTeamMemberLedger,
  listDirectoryTeamMemberReconciliations,
} from "@/lib/api";
import { formatNaira, formatTimeLabel } from "@/lib/format";
import { isAdmin } from "@/lib/roles";
import type { TeamMemberProfile } from "@/lib/ops-types";

type TeamProfileVM = TeamMemberProfile & {
  reconciliationPosture: ReconciliationPosture;
  _operational: {
    pendingTotal: number;
    awaitingReviewTotal: number;
    adjustedOrApprovedTotal: number;
    settledTotal: number;
    disputedTotal: number;
  };
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
      const expectedPayout = Number(monthStats.expected_payout_on_settled ?? 0);

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
          payout: adminView ? expectedPayout : 0,
        },
        allTimeStats: {
          revenue: Number(monthStats.all_time_gross_recorded ?? 0),
          services: Number(monthStats.all_time_services_count ?? 0),
          payout: adminView ? Number(monthStats.all_time_commission_total ?? 0) : 0,
        },
        reconciliationPosture: monthStats.reconciliation_posture ?? "clear",
        _operational: {
          pendingTotal: Number(monthStats.pending_total ?? 0),
          awaitingReviewTotal: Number(monthStats.awaiting_review_total ?? 0),
          adjustedOrApprovedTotal: Number(monthStats.adjusted_or_approved_total ?? 0),
          settledTotal: Number(monthStats.settled_total ?? 0),
          disputedTotal: Number(monthStats.disputed_total ?? 0),
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
      />

      <OperationalPostureSection profile={profile} />

      <EmployeeReconciliationWorkspace
        memberId={memberId}
        memberName={profile.displayName}
      />
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
  const [ledger, setLedger] = React.useState<DirectoryBarberLedgerRow[]>([]);
  const [ledgerPage, setLedgerPage] = React.useState(1);
  const [ledgerTotal, setLedgerTotal] = React.useState(0);
  const [recs, setRecs] = React.useState<DirectoryBarberReconciliationRow[]>([]);
  const [recsPage, setRecsPage] = React.useState(1);
  const [recsTotal, setRecsTotal] = React.useState(0);
  const [statements, setStatements] = React.useState<CommissionStatementRow[]>([]);
  const pageSize = 10;

  const loadAdminSections = React.useCallback(async () => {
    try {
      const [ledgerRes, recRes, commissionRes] = await Promise.all([
        listDirectoryTeamMemberLedger(memberId, { page: ledgerPage, page_size: pageSize }),
        listDirectoryTeamMemberReconciliations(memberId, { page: recsPage, page_size: pageSize }),
        listCommissionStatements(),
      ]);
      setLedger(ledgerRes.items ?? []);
      setLedgerTotal(ledgerRes.total ?? 0);
      setRecs(recRes.items ?? []);
      setRecsTotal(recRes.total ?? 0);
      setStatements(
        (commissionRes.items ?? []).filter((s) => String(s.user_id) === String(memberId)),
      );
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }, [memberId, ledgerPage, recsPage]);

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

  const ledgerPages = Math.max(1, Math.ceil(ledgerTotal / pageSize));
  const recPages = Math.max(1, Math.ceil(recsTotal / pageSize));
  const showReconciliation = profile.role === "barber" || recs.length > 0;

  return (
    <div className="space-y-12">
      <TeamMemberProfileView profile={profile} variant="full" />
      <OperationalPostureSection profile={profile} />

      <section className="space-y-4">
        <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
          Service history
        </h3>
        {ledger.length === 0 ? (
          <EmptyPanel message="No services recorded yet for this profile." />
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
            {ledger.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                      #{t.barber_sequence_index ?? "—"}
                    </span>
                    <StatusBadge
                      status={
                        (t.reconciliation_status ?? "pending")
                          .replace("awaiting_barber_review", "awaiting_review")
                          .replace("missing_barber_entry", "approved")
                          .replace("manager_override", "approved") as
                          | "pending"
                          | "approved"
                          | "adjusted"
                          | "awaiting_review"
                          | "settled"
                          | "disputed"
                          | "locked"
                      }
                    />
                  </div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Service · {t.service_type_id ?? "—"}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {formatTimeLabel(t.occurred_at)}
                  </p>
                </div>
                <p className="font-[family-name:var(--font-serif)] text-sm font-semibold tabular-nums">
                  {formatNaira(Number(t.amount))}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={ledgerPage}
          totalPages={ledgerPages}
          onPrev={() => setLedgerPage((p) => Math.max(1, p - 1))}
          onNext={() => setLedgerPage((p) => Math.min(ledgerPages, p + 1))}
        />
      </section>

      {showReconciliation ? (
        <section className="space-y-4">
          <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
            Reconciliation history
          </h3>
          {recs.length === 0 ? (
            <EmptyPanel message="No reconciliations recorded yet." />
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
              {recs.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-[var(--foreground)]">{r.business_date}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Status · {String(r.status).replace(/_/g, " ")} · version{" "}
                      {r.manager_proposal_version}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                    {formatNaira(Number(r.total_manager_approved ?? 0))}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={recsPage}
            totalPages={recPages}
            onPrev={() => setRecsPage((p) => Math.max(1, p - 1))}
            onNext={() => setRecsPage((p) => Math.min(recPages, p + 1))}
          />
        </section>
      ) : null}

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

      <EmployeeReconciliationWorkspace
        memberId={memberId}
        memberName={profile.displayName}
      />
    </div>
  );
}

function OperationalPostureSection({ profile }: { profile: TeamProfileVM }) {
  return (
    <section className="space-y-4">
      <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
        Month posture
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Pending", profile._operational.pendingTotal, "text-amber-800 dark:text-amber-200"],
          [
            "Awaiting review",
            profile._operational.awaitingReviewTotal,
            "text-violet-800 dark:text-violet-200",
          ],
          [
            "Approved/adjusted",
            profile._operational.adjustedOrApprovedTotal,
            "text-sky-800 dark:text-sky-200",
          ],
          ["Settled", profile._operational.settledTotal, "text-emerald-700 dark:text-emerald-300"],
          ["Disputed", profile._operational.disputedTotal, "text-rose-700 dark:text-rose-300"],
        ].map(([label, val, tone]) => (
          <div
            key={String(label)}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              {label}
            </p>
            <p
              className={`mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums ${tone}`}
            >
              {formatNaira(Number(val))}
            </p>
          </div>
        ))}
      </div>
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

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="h-8 rounded-full border border-dashed border-[var(--border)] px-4 text-sm text-[var(--foreground)] disabled:opacity-50"
          disabled={page <= 1}
          onClick={onPrev}
        >
          Previous
        </button>
        <button
          type="button"
          className="h-8 rounded-full border border-dashed border-[var(--border)] px-4 text-sm text-[var(--foreground)] disabled:opacity-50"
          disabled={page >= totalPages}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}
