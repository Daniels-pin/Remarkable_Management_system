"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { BarberProfileView } from "@/components/ops/barber-profile-view";
import { StatusBadge } from "@/components/ops/status-badge";
import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { useAuth } from "@/components/providers/auth-provider";
import {
  ApiError,
  type CommissionStatementRow,
  type DirectoryBarberLedgerRow,
  type DirectoryBarberReconciliationRow,
  getDirectoryBarber,
  getDirectoryBarberMonthStats,
  listCommissionStatements,
  listDirectoryBarberLedger,
  listDirectoryBarberReconciliations,
} from "@/lib/api";
import { formatNaira, formatTimeLabel } from "@/lib/format";

type BarberProfileVM = {
  id: string;
  displayName: string;
  initials: string;
  email: string;
  phone: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  commissionPct: number;
  salaryType: string;
  avatarUrl: string | null;
  monthStats: { revenue: number; services: number; product: number; payout: number };
  allTimeStats: { revenue: number; services: number; product: number; payout: number };
  _operational: {
    pendingTotal: number;
    awaitingReviewTotal: number;
    adjustedOrApprovedTotal: number;
    settledTotal: number;
    disputedTotal: number;
  };
};

export default function BarberDetailPage() {
  const params = useParams();
  useAuth();
  const id = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<BarberProfileVM | null>(null);

  const [ledger, setLedger] = React.useState<DirectoryBarberLedgerRow[]>([]);
  const [ledgerPage, setLedgerPage] = React.useState(1);
  const [ledgerTotal, setLedgerTotal] = React.useState(0);

  const [recs, setRecs] = React.useState<DirectoryBarberReconciliationRow[]>([]);
  const [recsPage, setRecsPage] = React.useState(1);
  const [recsTotal, setRecsTotal] = React.useState(0);

  const [statements, setStatements] = React.useState<CommissionStatementRow[]>([]);

  const pageSize = 10;

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [detail, monthStats, ledgerRes, recRes, commissionRes] = await Promise.all([
        getDirectoryBarber(id),
        getDirectoryBarberMonthStats(id),
        listDirectoryBarberLedger(id, { page: ledgerPage, page_size: pageSize }),
        listDirectoryBarberReconciliations(id, { page: recsPage, page_size: pageSize }),
        listCommissionStatements(),
      ]);

      if (!detail.found || !detail.barber) {
        setProfile(null);
        return;
      }

      const name = detail.barber.full_name?.trim() || `@${detail.barber.username}`;
      const initials =
        detail.barber.full_name
          ?.trim()
          ?.split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0])
          .join("")
          .toUpperCase() || detail.barber.username.slice(0, 2).toUpperCase();

      const commissionPct = detail.barber.commission_pct ? Number(detail.barber.commission_pct) : 0;
      const expectedPayout = Number(monthStats.expected_payout_on_settled ?? 0);

      setProfile({
        id: detail.barber.id,
        displayName: name,
        initials,
        email: detail.barber.email,
        phone: detail.barber.phone ?? "—",
        bankName: detail.barber.bank_name ?? "Not on file",
        accountNumber: detail.barber.account_number ?? "—",
        accountName: detail.barber.account_name ?? "—",
        commissionPct,
        salaryType: (detail.barber.salary_type || "commission").replace(/_/g, " "),
        avatarUrl: null,
        monthStats: {
          revenue: Number(monthStats.current_month_gross_recorded ?? 0),
          services: Number(monthStats.current_month_gross_recorded ?? 0),
          product: 0,
          payout: expectedPayout,
        },
        allTimeStats: { revenue: 0, services: 0, product: 0, payout: 0 },
        _operational: {
          pendingTotal: Number(monthStats.pending_total ?? 0),
          awaitingReviewTotal: Number(monthStats.awaiting_review_total ?? 0),
          adjustedOrApprovedTotal: Number(monthStats.adjusted_or_approved_total ?? 0),
          settledTotal: Number(monthStats.settled_total ?? 0),
          disputedTotal: Number(monthStats.disputed_total ?? 0),
        },
      });

      setLedger(ledgerRes.items ?? []);
      setLedgerTotal(ledgerRes.total ?? 0);

      setRecs(recRes.items ?? []);
      setRecsTotal(recRes.total ?? 0);

      setStatements(
        (commissionRes.items ?? []).filter((s) => String(s.user_id) === String(detail.barber!.id)),
      );
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load barber profile.");
    } finally {
      setLoading(false);
    }
  }, [id, ledgerPage, recsPage]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (!profile) {
    return (
      <BarbershopShell title="Barber" subtitle="Profile not found.">
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No barber matches this link.</p>
          <Link
            href="/barbershop/barbers"
            className="mt-4 inline-flex h-8 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-transparent px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            Back to barbers
          </Link>
        </div>
      </BarbershopShell>
    );
  }

  const payouts = statements.map((s) => ({
    id: s.id,
    periodLabel: s.financial_month_id,
    amount: Number(s.commission_amount ?? 0),
    status: s.payout_state === "paid" ? "paid" : "pending",
    paidAt: s.payout_payment_date,
  }));

  const ledgerPages = Math.max(1, Math.ceil(ledgerTotal / pageSize));
  const recPages = Math.max(1, Math.ceil(recsTotal / pageSize));

  return (
    <BarbershopShell
      title={profile.displayName}
      subtitle="Detailed profile, banking, and ledger history."
    >
      <div className="mb-6">
        <Link
          href="/barbershop/barbers"
          className="inline-flex h-8 items-center rounded-full px-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← Barbers
        </Link>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--muted-foreground)]">Loading profile…</p>
        </div>
      ) : (
        <BarberProfileView profile={profile} variant="full" />
      )}

      <section className="mt-12 space-y-4">
        <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
          Month posture
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Pending", profile._operational?.pendingTotal ?? 0, "text-amber-800 dark:text-amber-200"],
            ["Awaiting review", profile._operational?.awaitingReviewTotal ?? 0, "text-violet-800 dark:text-violet-200"],
            ["Approved/adjusted", profile._operational?.adjustedOrApprovedTotal ?? 0, "text-sky-800 dark:text-sky-200"],
            ["Settled", profile._operational?.settledTotal ?? 0, "text-emerald-700 dark:text-emerald-300"],
            ["Disputed", profile._operational?.disputedTotal ?? 0, "text-rose-700 dark:text-rose-300"],
          ].map(([label, val, tone]) => (
            <div key={String(label)} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                {label}
              </p>
              <p className={`mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums ${tone}`}>
                {formatNaira(Number(val))}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 space-y-4">
        <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
          Transaction history
        </h3>
        {ledger.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
            No transactions recorded yet for this profile.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
            {ledger.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                          .replace("manager_override", "approved")
                      }
                    />
                  </div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Service · {t.service_type_id ?? "—"}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">{formatTimeLabel(t.occurred_at)}</p>
                </div>
                <p className="font-[family-name:var(--font-serif)] text-sm font-semibold tabular-nums">
                  {formatNaira(Number(t.amount))}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            Page {ledgerPage} of {ledgerPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-8 rounded-full border border-dashed border-[var(--border)] px-4 text-sm text-[var(--foreground)] disabled:opacity-50"
              disabled={ledgerPage <= 1}
              onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="h-8 rounded-full border border-dashed border-[var(--border)] px-4 text-sm text-[var(--foreground)] disabled:opacity-50"
              disabled={ledgerPage >= ledgerPages}
              onClick={() => setLedgerPage((p) => Math.min(ledgerPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="mt-12 space-y-4">
        <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
          Reconciliation history
        </h3>
        {recs.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
            No reconciliations recorded yet.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
            {recs.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-[var(--foreground)]">{r.business_date}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Status · {String(r.status).replace(/_/g, " ")} · version {r.manager_proposal_version}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                  {formatNaira(Number(r.total_manager_approved ?? 0))}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            Page {recsPage} of {recPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-8 rounded-full border border-dashed border-[var(--border)] px-4 text-sm text-[var(--foreground)] disabled:opacity-50"
              disabled={recsPage <= 1}
              onClick={() => setRecsPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="h-8 rounded-full border border-dashed border-[var(--border)] px-4 text-sm text-[var(--foreground)] disabled:opacity-50"
              disabled={recsPage >= recPages}
              onClick={() => setRecsPage((p) => Math.min(recPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="mt-12 space-y-4">
        <h3 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
          Payout history
        </h3>
        {payouts.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
            No payroll runs recorded yet.
          </div>
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
    </BarbershopShell>
  );
}
