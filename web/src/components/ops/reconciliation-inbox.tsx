"use client";

import * as React from "react";
import { toast } from "sonner";

import { ReconciliationComparisonBadge } from "@/components/ops/reconciliation-comparison-badge";
import { Button } from "@/components/ui/button";
import { OperationalAlertBadge } from "@/components/ui/operational-alert-badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ApiError,
  matchAllPendingLedgerEntries,
  matchPendingLedgerEntry,
  resolveMismatchUseEmployeeAmount,
  type ReconciliationInboxRow,
} from "@/lib/api";
import { dispatchReconciliationUpdated } from "@/lib/reconciliation-events";
import { formatNaira, formatTimeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAYMENT_OPTIONS = [
  { value: "cash" as const, label: "Cash" },
  { value: "transfer" as const, label: "Transfer" },
  { value: "pos" as const, label: "POS" },
];

function PaymentSelect({
  value,
  onChange,
}: {
  value: "cash" | "transfer" | "pos";
  onChange: (v: "cash" | "transfer" | "pos") => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PAYMENT_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          variant={value === opt.value ? "default" : "outline"}
          className={cn(
            "rounded-full text-xs",
            value === opt.value
              ? "border-transparent bg-[var(--foreground)] text-[var(--background)]"
              : "border-dashed",
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

function InboxRow({
  row,
  onSelect,
  showMatchAction,
}: {
  row: ReconciliationInboxRow;
  onSelect: (row: ReconciliationInboxRow) => void;
  showMatchAction?: boolean;
}) {
  const indexLabel = row.index_label ?? `#${String(row.index).padStart(3, "0")}`;
  const amount = row.employee_amount ?? row.manager_amount ?? row.amount;
  const time = row.occurred_at;
  const canMatch =
    showMatchAction &&
    row.comparison_status === "missing_manager_entry" &&
    Boolean(row.employee_entry_id);

  return (
    <li>
      <div className="flex w-full items-center gap-3 border-b border-[var(--border)]/70 px-3 py-2.5 lg:px-4">
        <button
          type="button"
          onClick={() => onSelect(row)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:opacity-80"
        >
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--muted-foreground)]">
            {indexLabel}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-[var(--foreground)]">
              {row.service_name}
            </p>
            <p className="truncate text-[10px] text-[var(--muted-foreground)]">
              {row.employee_name ?? "Team member"}
            </p>
          </div>
          <ReconciliationComparisonBadge status={row.comparison_status} compact />
          <span className="shrink-0 text-xs font-medium tabular-nums text-[var(--foreground)]">
            {amount != null ? formatNaira(Number(amount)) : "—"}
          </span>
          <span className="hidden shrink-0 text-[10px] tabular-nums text-[var(--muted-foreground)] sm:block">
            {formatTimeLabel(time).split("·").pop()?.trim()}
          </span>
        </button>
        {canMatch ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0 rounded-full bg-[var(--foreground)] px-3 text-xs text-[var(--background)]"
            onClick={() => onSelect(row)}
          >
            Match
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function ReconciliationInboxTable({
  rows,
  loading,
  emptyTitle,
  emptyBody,
  onSelect,
  showMatchAction,
}: {
  rows: ReconciliationInboxRow[];
  loading: boolean;
  emptyTitle: string;
  emptyBody: string;
  onSelect: (row: ReconciliationInboxRow) => void;
  showMatchAction?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)] shadow-[var(--shadow-card)]">
        Loading inbox…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)] px-6 py-16 text-center shadow-[var(--shadow-card)]">
        <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
          {emptyTitle}
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">{emptyBody}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)] shadow-[var(--shadow-card)]">
      <ul>
        {rows.map((row) => (
          <InboxRow
            key={row.id}
            row={row}
            onSelect={onSelect}
            showMatchAction={showMatchAction}
          />
        ))}
      </ul>
    </div>
  );
}

export function PendingMatchSheet({
  row,
  open,
  onOpenChange,
  onMatched,
}: {
  row: ReconciliationInboxRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMatched: () => void;
}) {
  const [paymentMethod, setPaymentMethod] = React.useState<"cash" | "transfer" | "pos">("cash");
  const [submitting, setSubmitting] = React.useState(false);
  const [matchStep, setMatchStep] = React.useState<"idle" | "confirm">("idle");

  React.useEffect(() => {
    if (open) {
      setPaymentMethod("cash");
      setMatchStep("idle");
    }
  }, [open, row?.id]);

  const employeeEntryId = row?.employee_entry_id;
  const canMatch = Boolean(employeeEntryId) && row?.comparison_status === "missing_manager_entry";

  async function confirmMatch() {
    if (!employeeEntryId) return;
    setSubmitting(true);
    try {
      await matchPendingLedgerEntry(employeeEntryId, paymentMethod);
      toast.success("Index matched");
      onOpenChange(false);
      onMatched();
      dispatchReconciliationUpdated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not match entry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Pending reconciliation</SheetTitle>
          <p className="text-sm text-[var(--muted-foreground)]">
            Confirm the missing manager-side record at the same index.
          </p>
        </SheetHeader>
        <div className="mt-4 space-y-5 overflow-y-auto">
          {!row ? null : (
            <div className="space-y-5">
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/30 p-4">
                <p className="font-mono text-xs text-[var(--muted-foreground)]">
                  {row.index_label ?? `#${String(row.index).padStart(3, "0")}`}
                </p>
                <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold text-[var(--foreground)]">
                  {row.service_name}
                </p>
                <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                  {row.employee_name ?? "Team member"}
                </p>
                <p className="mt-3 text-xl font-semibold tabular-nums">
                  {formatNaira(Number(row.employee_amount ?? row.amount ?? 0))}
                </p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {formatTimeLabel(row.occurred_at)}
                </p>
              </div>

              {row.employee ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                    Employee submission
                  </p>
                  <p className="text-sm text-[var(--foreground)]">
                    {row.employee.service_name} ·{" "}
                    <span className="tabular-nums">
                      {formatNaira(Number(row.employee.amount))}
                    </span>
                  </p>
                  {row.employee.note?.trim() ? (
                    <p className="text-xs italic text-[var(--muted-foreground)]">
                      &ldquo;{row.employee.note}&rdquo;
                    </p>
                  ) : null}
                </div>
              ) : null}

              {canMatch ? (
                <div className="space-y-3">
                  {matchStep === "idle" ? (
                    <Button
                      type="button"
                      className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]"
                      onClick={() => setMatchStep("confirm")}
                    >
                      Match
                    </Button>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs">Payment method</Label>
                        <PaymentSelect value={paymentMethod} onChange={setPaymentMethod} />
                      </div>
                      <Button
                        type="button"
                        className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]"
                        disabled={submitting}
                        onClick={() => void confirmMatch()}
                      >
                        Confirm match
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Awaiting the employee-side record for this index.
                </p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MismatchDetailSheet({
  row,
  open,
  onOpenChange,
  onResolved,
}: {
  row: ReconciliationInboxRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const employeeAmt = Number(row?.employee_amount ?? row?.employee?.amount ?? 0);
  const managerAmt = Number(row?.manager_amount ?? row?.manager?.amount ?? 0);
  const delta = managerAmt - employeeAmt;

  async function acceptEmployeeAmount() {
    if (!row?.employee_entry_id) return;
    setSubmitting(true);
    try {
      await resolveMismatchUseEmployeeAmount(row.employee_entry_id);
      toast.success("Mismatch resolved — amounts aligned");
      onOpenChange(false);
      onResolved();
      dispatchReconciliationUpdated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not resolve mismatch.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Amount mismatch</SheetTitle>
          <p className="text-sm text-[var(--muted-foreground)]">
            Side-by-side comparison at index{" "}
            {row?.index_label ?? (row ? `#${String(row.index).padStart(3, "0")}` : "")}
          </p>
        </SheetHeader>
        <div className="mt-4 space-y-5 overflow-y-auto">
          {!row ? null : (
            <div className="space-y-5">
              <p className="text-sm text-[var(--muted-foreground)]">
                {row.service_name} · {row.employee_name}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                    Employee
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums">
                    {formatNaira(employeeAmt)}
                  </p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                    Manager
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums">
                    {formatNaira(managerAmt)}
                  </p>
                </div>
              </div>
              <div className="rounded-[var(--radius-md)] border border-rose-500/25 bg-rose-500/8 px-3 py-2.5 text-sm">
                <span className="text-[var(--muted-foreground)]">Difference </span>
                <span className="font-semibold tabular-nums text-[var(--foreground)]">
                  {formatNaira(Math.abs(delta))}
                  {delta > 0 ? " (manager higher)" : delta < 0 ? " (employee higher)" : ""}
                </span>
              </div>
              <Button
                type="button"
                className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]"
                disabled={submitting || !row.employee_entry_id}
                onClick={() => void acceptEmployeeAmount()}
              >
                Settle using employee amount
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MatchAllConfirmDialog({
  open,
  onOpenChange,
  pendingCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingCount: number;
  onConfirm: (paymentMethod: "cash" | "transfer" | "pos") => Promise<void>;
}) {
  const [paymentMethod, setPaymentMethod] = React.useState<"cash" | "transfer" | "pos">("cash");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(paymentMethod);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Match all pending transactions?</DialogTitle>
          <DialogDescription>
            This will create manager-side records for {pendingCount} pending index
            {pendingCount === 1 ? "" : "es"}, preserving each original index and amount.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Payment method for all</Label>
            <PaymentSelect value={paymentMethod} onChange={setPaymentMethod} />
          </div>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full bg-[var(--foreground)] text-[var(--background)]"
              disabled={submitting || pendingCount === 0}
              onClick={() => void handleConfirm()}
            >
              Match all
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function MatchAllBar({
  pendingCount,
  onMatched,
}: {
  pendingCount: number;
  onMatched: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  if (pendingCount === 0) return null;

  return (
    <>
      <div className="flex justify-end border-t border-[var(--border)]/60 pt-6">
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-full border-dashed"
          onClick={() => setOpen(true)}
        >
          Match all
          <OperationalAlertBadge count={pendingCount} />
        </Button>
      </div>
      <MatchAllConfirmDialog
        open={open}
        onOpenChange={setOpen}
        pendingCount={pendingCount}
        onConfirm={async (paymentMethod) => {
          try {
            const res = await matchAllPendingLedgerEntries(paymentMethod);
            toast.success(`Matched ${res.matched_count} transaction${res.matched_count === 1 ? "" : "s"}`);
            onMatched();
            dispatchReconciliationUpdated();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Match all failed.");
            throw e;
          }
        }}
      />
    </>
  );
}
