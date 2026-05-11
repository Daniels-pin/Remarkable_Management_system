"use client";

import * as React from "react";
import { toast } from "sonner";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/auth-provider";
import {
  ApiError,
  barberAcceptReconciliationDay,
  barberGetReconciliationDay,
  barberRejectReconciliationDay,
  getManagerReconciliationDayDetail,
  listReconciliationQueue,
  managerProposeDay,
  managerReviseDay,
  type ReconciliationQueueRow,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";

function StatusPill({ status }: { status: string }) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider";
  const s = status.replace(/_/g, " ");
  const cls =
    status === "awaiting_barber_review"
      ? "border-violet-500/25 bg-violet-500/10 text-violet-900 dark:text-violet-200"
      : status === "disputed" || status === "admin_pending"
        ? "border-rose-500/25 bg-rose-500/10 text-rose-900 dark:text-rose-200"
        : status === "settled" || status === "settled_by_admin"
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
          : "border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)]";
  return <span className={`${base} ${cls}`}>{s}</span>;
}

export default function ReconciliationPage() {
  const { session } = useAuth();
  const role = session?.role;

  return (
    <BarbershopShell
      title="Reconciliation"
      subtitle="Manager propose → barber review → dispute → admin override."
    >
      {role === "barber" ? <BarberReconciliation /> : <ManagerReconciliation />}
    </BarbershopShell>
  );
}

function ManagerReconciliation() {
  const [loading, setLoading] = React.useState(true);
  const [queue, setQueue] = React.useState<ReconciliationQueueRow[]>([]);

  const [active, setActive] = React.useState<ReconciliationQueueRow | null>(null);
  const [detail, setDetail] = React.useState<Awaited<
    ReturnType<typeof getManagerReconciliationDayDetail>
  > | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const [markMissing, setMarkMissing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const loadQueue = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listReconciliationQueue();
      setQueue(res.items);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load reconciliation queue.");
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => void loadQueue());
  }, [loadQueue]);

  const openDetail = async (row: ReconciliationQueueRow) => {
    setActive(row);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await getManagerReconciliationDayDetail(row.barber_user_id, row.business_date);
      setDetail(d);
      setMarkMissing(Boolean(d.summary?.used_manager_entries_due_to_missing_barber));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load reconciliation detail.");
    } finally {
      setDetailLoading(false);
    }
  };

  const proposeOrRevise = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const body = { entry_amounts: null, mark_missing_barber_submission: markMissing };
      const isDisputed = active.status === "disputed";
      if (isDisputed) {
        await managerReviseDay(active.barber_user_id, active.business_date, body);
        toast.success("Revision sent to barber.");
      } else {
        await managerProposeDay(active.barber_user_id, active.business_date, body);
        toast.success("Proposal sent to barber.");
      }
      await loadQueue();
      if (active) await openDetail(active);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not submit.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm text-[var(--muted-foreground)]">Loading reconciliation…</p>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center shadow-[var(--shadow-card)]">
        <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
          No unresolved reconciliations
        </p>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          When barbers submit services and you propose official totals, items will appear here until
          settled or escalated.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Queue
          </p>
          <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => void loadQueue()}>
            Refresh
          </Button>
        </div>
        <ul className="space-y-2">
          {queue.map((row) => (
            <li key={row.summary_id}>
              <button
                type="button"
                onClick={() => void openDetail(row)}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left shadow-[var(--shadow-card)] hover:bg-[var(--muted)]/25"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {row.barber_label}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {row.business_date} · version {row.manager_proposal_version}
                    </p>
                  </div>
                  <StatusPill status={row.status} />
                </div>
                {row.barber_rejection_reason ? (
                  <p className="mt-2 text-xs italic text-rose-700 dark:text-rose-300">
                    “{row.barber_rejection_reason}”
                  </p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Review
        </p>
        {!active ? (
          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm text-[var(--muted-foreground)]">Select a day to review.</p>
          </div>
        ) : detailLoading ? (
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm text-[var(--muted-foreground)]">Loading detail…</p>
          </div>
        ) : (
          <Card className="border-[var(--border)]/90 shadow-[var(--shadow-card)]">
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {active.barber_label}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {active.business_date} · {active.status.replace(/_/g, " ")}
                  </p>
                </div>
                <StatusPill status={active.status} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                    Barber total
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums">
                    {formatNaira(Number(active.total_original_barber))}
                  </p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                    Manager approved
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums">
                    {formatNaira(Number(active.total_manager_approved))}
                  </p>
                </div>
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                <p className="text-xs font-medium text-[var(--foreground)]">Mismatch indicators</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Duplicate indexes:{" "}
                  <span className="text-[var(--foreground)]">
                    {String(detail?.issues?.duplicate_indexes?.length ?? 0)}
                  </span>{" "}
                  · Amount mismatches:{" "}
                  <span className="text-[var(--foreground)]">
                    {String(detail?.issues?.amount_mismatches?.length ?? 0)}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Manager official line (missing barber submission)</Label>
                  <input
                    type="checkbox"
                    checked={markMissing}
                    onChange={(e) => setMarkMissing(e.target.checked)}
                  />
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  If the barber didn’t submit entries at all, this flag makes the manager-created
                  lines auditable in the daily summary.
                </p>
              </div>

              <Button
                type="button"
                className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]"
                disabled={saving}
                onClick={() => void proposeOrRevise()}
              >
                {saving
                  ? "Submitting…"
                  : active.status === "disputed"
                    ? "Revise after dispute"
                    : "Propose official totals"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function BarberReconciliation() {
  const [day, setDay] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<Awaited<
    ReturnType<typeof barberGetReconciliationDay>
  > | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await barberGetReconciliationDay(day);
      setData(d);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load reconciliation.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [day]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const summary = data?.summary;

  const accept = async () => {
    setSaving(true);
    try {
      await barberAcceptReconciliationDay(day);
      toast.success("Reconciliation accepted.");
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not accept.");
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    if (rejectReason.trim().length < 1) {
      toast.error("Enter a reason.");
      return;
    }
    setSaving(true);
    try {
      await barberRejectReconciliationDay(day, rejectReason.trim());
      toast.message("Returned to manager", { description: "Your manager has been notified." });
      setRejectReason("");
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not reject.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Business day
          </p>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="mt-1.5 h-9 w-44" />
        </div>
        <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--muted-foreground)]">Loading day…</p>
        </div>
      ) : !summary ? (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center shadow-[var(--shadow-card)]">
          <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
            No reconciliation activity for this day
          </p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            When your manager proposes official totals, this page becomes your accept/reject desk.
          </p>
        </div>
      ) : (
        <Card className="border-[var(--border)]/90 shadow-[var(--shadow-card)]">
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Daily summary</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Status · {String(summary.status).replace(/_/g, " ")} · version{" "}
                  {summary.manager_proposal_version}
                </p>
              </div>
              <StatusPill status={String(summary.status)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  Your total
                </p>
                <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums">
                  {formatNaira(Number(summary.total_original_barber ?? 0))}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  Manager approved
                </p>
                <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums">
                  {formatNaira(Number(summary.total_manager_approved ?? 0))}
                </p>
              </div>
            </div>

            {String(summary.status) === "awaiting_barber_review" ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  className="flex-1 rounded-full bg-[var(--foreground)] text-[var(--background)]"
                  disabled={saving}
                  onClick={() => void accept()}
                >
                  {saving ? "Working…" : "Accept"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-full border-dashed"
                  disabled={saving}
                  onClick={() => void reject()}
                >
                  Reject
                </Button>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                This day is not awaiting your review right now.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="rej">Rejection reason</Label>
              <Input
                id="rej"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="What looks incorrect?"
              />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

