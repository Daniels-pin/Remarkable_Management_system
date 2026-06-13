"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { LedgerVoidBadge } from "@/components/ops/ledger-void-badge";
import { PaymentMethodAdjustmentHistory } from "@/components/ops/payment-method-adjustment-history";
import { ReconciliationComparisonBadge } from "@/components/ops/reconciliation-comparison-badge";
import { ReconciliationReviewDialog } from "@/components/ops/reconciliation-review-dialog";
import { StatusBadge } from "@/components/ops/status-badge";
import { Button } from "@/components/ui/button";
import { formatExpensePaymentSource } from "@/lib/expense-payment";
import { formatCatalogDate, formatNaira, formatTimeLabel, formatTimeShort } from "@/lib/format";
import { formatLedgerIndexLabel } from "@/lib/ledger-index";
import type { LedgerTransaction } from "@/lib/ops-types";
import type { ReconciliationComparisonStatus } from "@/lib/reconciliation-status";
import { rowHighlightFromComparison } from "@/lib/reconciliation-status";
import { cn } from "@/lib/utils";

const DESKTOP_GRID =
  "md:grid md:grid-cols-[3.25rem_minmax(5rem,1fr)_minmax(3.5rem,0.9fr)_5rem_4.5rem_3.25rem_2.75rem_1.5rem] md:items-center md:gap-x-3";

function typeLabel(t: LedgerTransaction) {
  if (t.type === "service") return t.serviceType ?? "Service";
  if (t.type === "sale") return t.saleCategory ?? "Sale";
  return t.expenseCategory ?? "Expense";
}

function formatPayment(t: LedgerTransaction): string | null {
  if (t.type === "expense" && t.paymentMethod) {
    return formatExpensePaymentSource(t.paymentMethod) ?? t.paymentMethod.replace(/_/g, " ");
  }
  if (t.paymentMethod) return t.paymentMethod.replace(/_/g, " ");
  return null;
}

function AuditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function CompactLedgerRow({
  row,
  onReview,
  onVoid,
  onEdit,
  onCorrectPaymentMethod,
}: {
  row: LedgerTransaction;
  onReview: (t: LedgerTransaction) => void;
  onVoid?: (t: LedgerTransaction) => void;
  onEdit?: (t: LedgerTransaction) => void;
  onCorrectPaymentMethod?: (t: LedgerTransaction) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const label = typeLabel(row);
  const payment = formatPayment(row);
  const time = formatTimeShort(row.createdAt);
  const comparisonStatus = row.comparisonStatus as ReconciliationComparisonStatus | undefined;
  const voided = row.isVoided || row.recordLifecycle === "deleted";
  const showActions = !voided && !row.pendingVoidReason && (onVoid || onEdit);
  const canCorrectPayment =
    !voided &&
    !row.pendingVoidReason &&
    row.type === "service" &&
    row.comparisonStatus === "matched" &&
    (row.paymentMethod === "cash" ||
      row.paymentMethod === "transfer" ||
      row.paymentMethod === "pos") &&
    Boolean(onCorrectPaymentMethod);

  const toggle = () => setExpanded((v) => !v);

  return (
    <li
      className={cn(
        "border-b border-[var(--border)]/70 last:border-b-0 transition-colors",
        voided && "opacity-55",
        row.type === "service" && comparisonStatus && !voided
          ? rowHighlightFromComparison(comparisonStatus)
          : "hover:bg-[var(--muted)]/20",
        expanded && "bg-[var(--muted)]/15",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className={cn("cursor-pointer px-3 py-1.5 lg:px-4", DESKTOP_GRID)}
      >
        <div className="flex min-w-0 items-center gap-2 md:contents">
          <span className="shrink-0 font-mono text-[11px] font-medium tabular-nums text-[var(--muted-foreground)] md:col-start-1">
            {formatLedgerIndexLabel(row.type, row.index, row.indexLabel)}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--foreground)] md:col-start-2">
            {label}
            {voided || row.pendingVoidReason ? (
              <span className="ml-2 inline-block align-middle">
                <LedgerVoidBadge
                  compact
                  meta={{
                    isVoided: voided,
                    voidReason: row.voidReason,
                    voidedByLabel: row.voidedByLabel,
                    pendingVoidReason: row.pendingVoidReason,
                    pendingVoidByLabel: row.pendingVoidByLabel,
                  }}
                />
              </span>
            ) : null}
          </span>
          <span className="shrink-0 md:hidden">
            {row.type === "service" && comparisonStatus ? (
              <ReconciliationComparisonBadge status={comparisonStatus} compact />
            ) : (
              <StatusBadge status={row.status} />
            )}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform md:hidden",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0 pl-10 text-[10px] text-[var(--muted-foreground)] md:hidden">
          <span className="max-w-[6rem] truncate">{row.employeeName ?? "House"}</span>
          <span className="text-xs font-medium tabular-nums text-[var(--foreground)]">
            {formatNaira(row.amount)}
          </span>
          {payment ? <span className="capitalize">{payment}</span> : null}
          <span className="tabular-nums">{time}</span>
        </div>

        <span className="hidden truncate text-[11px] text-[var(--muted-foreground)] md:col-start-3 md:block">
          {row.employeeName ?? "House"}
        </span>
        <div className="hidden md:col-start-4 md:block">
          {row.type === "service" && comparisonStatus ? (
            <ReconciliationComparisonBadge status={comparisonStatus} compact />
          ) : (
            <StatusBadge status={row.status} />
          )}
        </div>
        <span className="hidden text-right text-xs font-medium tabular-nums text-[var(--foreground)] md:col-start-5 md:block">
          {formatNaira(row.amount)}
        </span>
        <span className="hidden truncate capitalize text-[11px] text-[var(--muted-foreground)] md:col-start-6 md:block">
          {payment ?? "—"}
        </span>
        <div className="hidden text-right text-[11px] tabular-nums text-[var(--muted-foreground)] md:col-start-7 md:block">
          {time}
        </div>
        <div className="hidden md:col-start-8 md:flex md:items-center md:justify-center">
          <ChevronDown
            className={cn(
              "size-3.5 text-[var(--muted-foreground)] transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-[var(--border)]/60 bg-[var(--muted)]/10 px-3 py-2 lg:px-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AuditField label="Entry">
              <p className="text-xs text-[var(--foreground)]">
                <span className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  {row.type}
                </span>
                {" · "}
                {row.employeeName ?? "House"}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                Recorded {formatTimeLabel(row.createdAt)}
                {row.businessDate ? ` · ${formatCatalogDate(row.businessDate)}` : ""}
              </p>
              {row.reconciledAt ? (
                <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                  Reconciled {formatTimeLabel(row.reconciledAt)}
                </p>
              ) : null}
              {row.previousAmount != null ? (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Edited from{" "}
                  <span className="tabular-nums">{formatNaira(row.previousAmount)}</span>
                  {" → "}
                  <span className="font-medium tabular-nums text-[var(--foreground)]">
                    {formatNaira(row.amount)}
                  </span>
                </p>
              ) : null}
            </AuditField>

            <AuditField label="Payment & amount">
              <p className="text-xs font-medium tabular-nums text-[var(--foreground)]">
                {formatNaira(row.amount)}
              </p>
              <p className="mt-0.5 capitalize text-[11px] text-[var(--muted-foreground)]">
                {payment ?? "No payment method"}
              </p>
            </AuditField>

            <AuditField label="Status">
              {row.type === "service" && comparisonStatus ? (
                <ReconciliationComparisonBadge status={comparisonStatus} />
              ) : (
                <StatusBadge status={row.status} />
              )}
              {row.note?.trim() ? (
                <p className="mt-1.5 text-xs italic text-[var(--muted-foreground)]">&ldquo;{row.note}&rdquo;</p>
              ) : null}
            </AuditField>
          </div>

          {row.reconciliation ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)]/50 pt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full border-dashed text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onReview(row);
                }}
              >
                Review reconciliation
              </Button>
            </div>
          ) : null}

          {(voided || row.pendingVoidReason) ? (
            <VoidAuditBlock row={row} voided={voided} />
          ) : null}

          {showActions ? (
            <RowActionsBlock row={row} onEdit={onEdit} onVoid={onVoid} />
          ) : null}

          {canCorrectPayment ? (
            <div className="mt-3 border-t border-[var(--border)]/50 pt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full border-dashed text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onCorrectPaymentMethod?.(row);
                }}
              >
                Correct payment method
              </Button>
            </div>
          ) : null}

          {row.paymentMethodAdjustments?.length ? (
            <PaymentMethodAdjustmentHistory
              adjustments={row.paymentMethodAdjustments}
              className="mt-3 border-t border-[var(--border)]/50 pt-3"
            />
          ) : null}

          <p className="mt-2 font-mono text-[10px] text-[var(--muted-foreground)]">ID:{row.id}</p>
        </div>
      ) : null}
    </li>
  );
}

function VoidAuditBlock({
  row,
  voided,
}: {
  row: LedgerTransaction;
  voided: boolean;
}) {
  return (
    <div className="mt-3 border-t border-[var(--border)]/50 pt-2">
      <LedgerVoidBadge
        meta={{
          isVoided: voided,
          voidReason: row.voidReason,
          voidedByLabel: row.voidedByLabel,
          voidedAt: row.voidedAt,
          pendingVoidReason: row.pendingVoidReason,
          pendingVoidByLabel: row.pendingVoidByLabel,
        }}
      />
    </div>
  );
}

function RowActionsBlock({
  row,
  onEdit,
  onVoid,
}: {
  row: LedgerTransaction;
  onEdit?: (t: LedgerTransaction) => void;
  onVoid?: (t: LedgerTransaction) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)]/50 pt-2">
      {onEdit && row.canEdit !== false ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(row);
          }}
        >
          Edit
        </Button>
      ) : null}
      {onVoid && row.canVoid !== false ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full border-red-500/30 text-xs text-red-600 hover:bg-red-500/5 dark:text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            onVoid(row);
          }}
        >
          Void record
        </Button>
      ) : null}
    </div>
  );
}

export function CompactLedgerTable({
  rows,
  loading,
  emptyTitle,
  emptyBody,
  onReconciliationAccept,
  onVoid,
  onEdit,
  onCorrectPaymentMethod,
}: {
  rows: LedgerTransaction[];
  loading: boolean;
  emptyTitle: string;
  emptyBody: string;
  onReconciliationAccept?: (id: string) => void;
  onVoid?: (row: LedgerTransaction) => void;
  onEdit?: (row: LedgerTransaction) => void;
  onCorrectPaymentMethod?: (row: LedgerTransaction) => void;
}) {
  const [review, setReview] = React.useState<LedgerTransaction | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)] shadow-[var(--shadow-card)]">
        <div className="md:min-w-[640px]">
                      <div
            className={cn(
              "hidden border-b border-[var(--border)]/80 bg-[var(--muted)]/25 px-3 py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)] lg:px-4",
              DESKTOP_GRID,
            )}
          >
            <span>Index</span>
            <span>Description</span>
            <span>Employee</span>
            <span>Status</span>
            <span className="text-right">Amount</span>
            <span>Pay</span>
            <span className="text-right">Time</span>
            <span className="sr-only">Details</span>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
              Loading ledger…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[var(--foreground)]">{emptyTitle}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--muted-foreground)]">{emptyBody}</p>
            </div>
          ) : (
            <ul>
              {rows.map((row) => (
                <CompactLedgerRow
                  key={row.id}
                  row={row}
                  onReview={setReview}
                  onVoid={onVoid}
                  onEdit={onEdit}
                  onCorrectPaymentMethod={onCorrectPaymentMethod}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <ReconciliationReviewDialog
        open={Boolean(review)}
        onOpenChange={(o) => !o && setReview(null)}
        transaction={review}
        onAccept={(id) => {
          onReconciliationAccept?.(id);
          setReview(null);
        }}
        onReject={() => setReview(null)}
      />
    </>
  );
}