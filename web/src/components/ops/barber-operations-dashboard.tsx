"use client";

import * as React from "react";
import Link from "next/link";

import { BarberProfileView } from "@/components/ops/barber-profile-view";
import { RecordServiceFab } from "@/components/ops/record-service-fab";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { canAccessBarbershopFinance } from "@/lib/barbershop-access";
import {
  ApiError,
  getBarberDashboard,
  listBarberDayLedger,
  listServiceTypes,
  type BarberLedgerServiceRow,
} from "@/lib/api";
import { formatNaira, formatTimeLabel } from "@/lib/format";
import { createEmptyBarberProfileForSession, INITIAL_PAYOUT_HISTORY } from "@/lib/ops-initial-state";
import type { BarberProfile, LedgerTransaction, TransactionStatus } from "@/lib/ops-types";
import { StatusBadge } from "@/components/ops/status-badge";
import { toast } from "sonner";

function LedgerRow({ t }: { t: LedgerTransaction }) {
  return (
    <li className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium tabular-nums text-[var(--muted-foreground)]">
            #{t.index}
          </span>
          <StatusBadge status={t.status} />
        </div>
        <p className="truncate text-sm font-medium text-[var(--foreground)]">
          {t.serviceType ?? "Service"}
        </p>
        {t.previousAmount != null ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Edited from{" "}
            <span className="tabular-nums text-[var(--foreground)]">{formatNaira(t.previousAmount)}</span>
            {" → "}
            <span className="tabular-nums font-medium text-[var(--foreground)]">{formatNaira(t.amount)}</span>
          </p>
        ) : null}
        <p className="text-[11px] text-[var(--muted-foreground)]">{formatTimeLabel(t.createdAt)}</p>
      </div>
      <div className="text-right">
        <p className="font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums text-[var(--foreground)]">
          {formatNaira(t.amount)}
        </p>
        {t.paymentMethod ? (
          <p className="text-xs capitalize text-[var(--muted-foreground)]">{t.paymentMethod}</p>
        ) : null}
      </div>
    </li>
  );
}

function mapServiceRow(r: BarberLedgerServiceRow, serviceNames: Map<string, string>): LedgerTransaction {
  const amount = Number(r.amount);
  const status = statusFromReconciliation(r.reconciliation_status);
  return {
    id: r.id,
    index: r.barber_sequence_index ?? 0,
    type: "service",
    employeeName: null,
    employeeId: null,
    amount: Number.isFinite(amount) ? amount : 0,
    paymentMethod:
      r.payment_method === "cash" || r.payment_method === "transfer" || r.payment_method === "pos"
        ? r.payment_method
        : null,
    note: r.note,
    status,
    createdAt: r.occurred_at,
    serviceType: r.service_type_id ? serviceNames.get(r.service_type_id) : undefined,
  };
}

function statusFromReconciliation(raw: string | null): TransactionStatus {
  switch (raw) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "disputed":
      return "disputed";
    case "settled":
      return "settled";
    case "awaiting_barber_review":
      return "awaiting_review";
    case "adjusted":
      return "adjusted";
    default:
      return "pending";
  }
}

export function BarberOperationsDashboard() {
  const { session } = useAuth();
  const isStaff = session?.role === "staff";
  const showFinanceTab = canAccessBarbershopFinance(session?.role);
  const baseProfile = React.useMemo(
    () => (session ? createEmptyBarberProfileForSession(session) : null),
    [session],
  );
  const [barber, setBarber] = React.useState<BarberProfile | null>(baseProfile);
  const [stats, setStats] = React.useState<{
    pending: number;
    approved: number;
    disputed: number;
  }>({ pending: 0, approved: 0, disputed: 0 });
  const [tab, setTab] = React.useState<"overview" | "finance">("overview");
  const [page, setPage] = React.useState(1);
  const [reviewDay, setReviewDay] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [feed, setFeed] = React.useState<LedgerTransaction[]>([]);
  const [feedTotal, setFeedTotal] = React.useState(0);
  const [feedLoading, setFeedLoading] = React.useState(false);
  const pageSize = 4;

  const loadStats = React.useCallback(async () => {
    if (!baseProfile) return;
    try {
      const s = await getBarberDashboard();
      setBarber({
        ...baseProfile,
        commissionPct: Number(s.commission_pct ?? 0),
        monthStats: {
          revenue: Number(s.current_month_gross_recorded ?? 0),
          services: Number(s.current_month_services_count ?? 0),
          payout: Number(s.expected_payout_on_settled ?? 0),
        },
        allTimeStats: {
          revenue: Number(s.all_time_gross_recorded ?? 0),
          services: Number(s.all_time_services_count ?? 0),
          payout: Number(s.all_time_commission_total ?? 0),
        },
      });
      setStats({
        pending: Number(s.pending_total ?? 0),
        approved: Number(s.approved_totals ?? 0),
        disputed: Number(s.disputed_total ?? 0),
      });
    } catch (e) {
      if (e instanceof ApiError) return;
    }
  }, [baseProfile]);

  const loadFeed = React.useCallback(async () => {
    setFeedLoading(true);
    try {
      const [ledger, svc] = await Promise.all([
        listBarberDayLedger(reviewDay, page, pageSize),
        listServiceTypes(),
      ]);
      const names = new Map(svc.items.map((t) => [t.id, t.name]));
      setFeed(ledger.items.map((r) => mapServiceRow(r, names)));
      setFeedTotal(ledger.total);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      setFeed([]);
      setFeedTotal(0);
    } finally {
      setFeedLoading(false);
    }
  }, [reviewDay, page, pageSize]);

  React.useEffect(() => {
    if (!baseProfile) return;
    queueMicrotask(() => {
      setBarber(baseProfile);
      void loadStats();
    });
  }, [baseProfile, loadStats]);

  React.useEffect(() => {
    queueMicrotask(() => {
      void loadFeed();
    });
  }, [loadFeed]);

  const refreshAll = React.useCallback(() => {
    void loadStats();
    void loadFeed();
  }, [loadStats, loadFeed]);

  const pages = Math.max(1, Math.ceil(feedTotal / pageSize));

  if (!session || !barber) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">Sign in to load your workspace.</p>
      </div>
    );
  }

  const payoutLabel = isStaff ? "Expected salary" : "Expected payout";
  const commissionLabel = isStaff ? "Compensation" : "Commission";

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
          Your performance
        </h2>
        <p className="max-w-xl text-sm text-[var(--muted-foreground)]">
          Personal revenue, service totals, and reconciliation status — focused on your work, not
          shop-wide finances.
        </p>
      </header>

      {showFinanceTab ? (
        <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--muted)]/40 p-1">
          {(
            [
              ["overview", "Overview"],
              ["finance", "Finance"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant="ghost"
              className={
                tab === id
                  ? "rounded-full bg-[var(--card)] shadow-[var(--shadow-card)]"
                  : "rounded-full text-[var(--muted-foreground)]"
              }
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}

      {tab === "overview" || !showFinanceTab ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="border-[var(--border)]/90 sm:col-span-2">
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Revenue generated
                </p>
                <p className="font-[family-name:var(--font-serif)] text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                  {formatNaira(barber.monthStats.revenue)}
                </p>
                <p className="pt-1 text-xs text-[var(--muted-foreground)]">
                  Recorded service revenue for the current month.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Services rendered
                </p>
                <p className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">
                  {barber.monthStats.services}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  {commissionLabel}
                </p>
                <p className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">
                  {barber.commissionPct}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  {payoutLabel}
                </p>
                <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatNaira(barber.monthStats.payout)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Approved
                </p>
                <p className="text-xl font-semibold tabular-nums text-[var(--foreground)]">
                  {formatNaira(stats.approved)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Pending
                </p>
                <p className="text-xl font-semibold tabular-nums text-amber-800 dark:text-amber-200">
                  {formatNaira(stats.pending)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Disputed
                </p>
                <p className="text-xl font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                  {formatNaira(stats.disputed)}
                </p>
                <Link
                  href="/barbershop/reconciliation"
                  className="mt-2 inline-block text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline"
                >
                  Open reconciliation
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Review day
              </p>
              <Input
                type="date"
                value={reviewDay}
                onChange={(e) => {
                  setReviewDay(e.target.value);
                  setPage(1);
                }}
                className="mt-1.5 h-9 w-44"
              />
            </div>
          </div>

          <div>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Daily service feed
            </p>
            {feedLoading ? (
              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-12 text-center">
                <p className="text-sm text-[var(--muted-foreground)]">Loading services…</p>
              </div>
            ) : feed.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-12 text-center">
                <p className="text-sm font-medium text-[var(--foreground)]">No services for this day</p>
                <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--muted-foreground)]">
                  Record a service to start your index for the day. Entries stay pending until
                  reconciliation.
                </p>
                <div className="mt-6 flex justify-center">
                  <RecordServiceFab variant="inline" onCreated={refreshAll} />
                </div>
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {feed.map((t) => (
                    <LedgerRow key={t.id} t={t} />
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Page {page} of {pages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={page >= pages}
                      onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-8">
          <BarberProfileView profile={barber} variant="embedded" />
          <div>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Payout history
            </p>
            {INITIAL_PAYOUT_HISTORY.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
                <p className="text-sm text-[var(--muted-foreground)]">
                  No payroll runs recorded yet. Completed payouts will list here with paid dates.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
                {INITIAL_PAYOUT_HISTORY.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{p.periodLabel}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {p.status === "paid" && p.paidAt ? `Paid ${p.paidAt}` : "Scheduled"}
                      </p>
                    </div>
                    <span className="font-[family-name:var(--font-serif)] text-sm font-semibold tabular-nums">
                      {formatNaira(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Reconciliation
            </p>
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
              Review manager proposals and accept or dispute daily totals on the{" "}
              <Link href="/barbershop/reconciliation" className="font-medium text-[var(--foreground)] underline-offset-2 hover:underline">
                reconciliation page
              </Link>
              .
            </div>
          </div>
        </div>
      )}

      <RecordServiceFab onCreated={refreshAll} />
    </div>
  );
}
