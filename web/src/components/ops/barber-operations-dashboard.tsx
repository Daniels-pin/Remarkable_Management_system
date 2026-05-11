"use client";

import * as React from "react";

import { BarberProfileView } from "@/components/ops/barber-profile-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { formatNaira, formatTimeLabel } from "@/lib/format";
import {
  createEmptyBarberProfileForSession,
  INITIAL_PAYOUT_HISTORY,
  INITIAL_TRANSACTIONS,
} from "@/lib/ops-initial-state";
import type { LedgerTransaction } from "@/lib/ops-types";
import { StatusBadge } from "@/components/ops/status-badge";

function LedgerRow({ t }: { t: LedgerTransaction }) {
  return (
    <li className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium tabular-nums text-[var(--muted-foreground)]">
            #{t.index}
          </span>
          <StatusBadge status={t.status} />
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            {t.type}
          </span>
        </div>
        <p className="truncate text-sm font-medium text-[var(--foreground)]">
          {t.employeeName ?? "House"} · {t.serviceType ?? t.saleCategory ?? t.expenseCategory ?? "Entry"}
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

export function BarberOperationsDashboard() {
  const { session } = useAuth();
  const barber = session ? createEmptyBarberProfileForSession(session) : null;
  const [tab, setTab] = React.useState<"overview" | "finance">("overview");
  const [page, setPage] = React.useState(1);
  const [reviewDay, setReviewDay] = React.useState(() => new Date().toISOString().slice(0, 10));
  const pageSize = 4;

  const feed = React.useMemo(() => {
    if (!barber) return [];
    return INITIAL_TRANSACTIONS.filter((t) => t.employeeId === barber.id);
  }, [barber]);

  const paged = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return feed.slice(start, start + pageSize);
  }, [feed, page]);

  const pages = Math.max(1, Math.ceil(feed.length / pageSize));

  if (!barber) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">Sign in to load your workspace.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
          Your performance
        </h2>
        <p className="max-w-xl text-sm text-[var(--muted-foreground)]">
          Transparent numbers for the month, with quick access to what is approved, pending,
          and on the way to payout.
        </p>
      </header>

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

      {tab === "overview" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="border-[var(--border)]/90 sm:col-span-2">
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Current month revenue
                </p>
                <p className="font-[family-name:var(--font-serif)] text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                  {formatNaira(barber.monthStats.revenue)}
                </p>
                <p className="pt-1 text-xs text-[var(--muted-foreground)]">
                  No financial data available for this period until your services and sales post to
                  the ledger.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Commission
                </p>
                <p className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">
                  {barber.commissionPct}%
                </p>
                <p className="pt-1 text-xs text-[var(--muted-foreground)]">
                  Set when your profile is linked to payroll.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Expected payout
                </p>
                <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatNaira(barber.monthStats.payout)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Approved vs pending
                </p>
                <p className="text-sm text-[var(--foreground)]">
                  <span className="font-semibold tabular-nums">{formatNaira(0)}</span>
                  <span className="text-[var(--muted-foreground)]"> approved</span>
                </p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  <span className="font-medium tabular-nums text-amber-800 dark:text-amber-200">
                    {formatNaira(0)}
                  </span>{" "}
                  pending
                </p>
                <p className="pt-1 text-xs text-[var(--muted-foreground)]">
                  Split updates as tickets move through review.
                </p>
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
                onChange={(e) => setReviewDay(e.target.value)}
                className="mt-1.5 h-9 w-44"
              />
            </div>
          </div>

          <div>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Daily transaction feed
            </p>
            {feed.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-12 text-center">
                <p className="text-sm font-medium text-[var(--foreground)]">No transactions recorded yet</p>
                <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--muted-foreground)]">
                  Your chair and retail lines will populate here as soon as finance posts approved
                  entries against your ID.
                </p>
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {paged.map((t) => (
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
              Reconciliation history
            </p>
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
              No reconciliation history yet. Manager adjustments to your tickets will appear here
              with before and after amounts.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
