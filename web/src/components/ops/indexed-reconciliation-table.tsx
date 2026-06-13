"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { LedgerVoidBadge } from "@/components/ops/ledger-void-badge";
import { PaymentMethodAdjustmentHistory } from "@/components/ops/payment-method-adjustment-history";
import { ReconciliationComparisonBadge } from "@/components/ops/reconciliation-comparison-badge";
import { Button } from "@/components/ui/button";
import type { ReconciliationComparisonStatus } from "@/lib/reconciliation-status";
import { rowHighlightFromComparison } from "@/lib/reconciliation-status";
import type { ReconciliationWorkspaceRow } from "@/lib/api";
import { formatCatalogDate, formatNaira, formatTimeLabel, formatTimeShort } from "@/lib/format";
import { formatLedgerIndexLabel } from "@/lib/ledger-index";
import { cn } from "@/lib/utils";

const DESKTOP_GRID =
  "md:grid md:grid-cols-[3.25rem_minmax(5rem,1fr)_4.75rem_4.75rem_5.25rem_3.25rem_2.75rem_1.5rem] md:items-center md:gap-x-3";

export type IndexedReconciliationRow = ReconciliationWorkspaceRow & {
  payment_method?: string | null;
};

export type ReconciliationViewerSide = "employee" | "manager";

function indexLabel(row: IndexedReconciliationRow): string {
  return formatLedgerIndexLabel(
    "service",
    row.index,
    row.index_label,
    row.financial_year,
    row.financial_month,
  );
}

function formatPayment(method: string | null | undefined): string | null {
  if (!method) return null;
  return method.replace(/_/g, " ");
}

function CompactAmount({
  amount,
  missing,
  className,
}: {
  amount: string | null;
  missing: boolean;
  className?: string;
}) {
  if (missing || amount == null) {
    return (
      <span className={cn("text-[11px] tabular-nums text-[var(--muted-foreground)]", className)}>
        —
      </span>
    );
  }
  return (
    <span
      className={cn("text-xs font-medium tabular-nums text-[var(--foreground)]", className)}
    >
      {formatNaira(Number(amount))}
    </span>
  );
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

function SideAudit({
  label,
  side,
  missing,
}: {
  label: string;
  side: IndexedReconciliationRow["employee"];
  missing: boolean;
}) {
  if (missing || !side) {
    return (
      <AuditField label={label}>
        <p className="text-[var(--muted-foreground)]">Not recorded</p>
      </AuditField>
    );
  }
  const payment = formatPayment(side.payment_method);
  return (
    <AuditField label={label}>
      <p className="font-medium text-[var(--foreground)]">
        {side.service_name} ·{" "}
        <span className="tabular-nums">{formatNaira(Number(side.amount))}</span>
        {payment ? <span className="text-[var(--muted-foreground)]"> · {payment}</span> : null}
      </p>
      <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
        Recorded {formatTimeLabel(side.occurred_at)}
        {side.business_date ? ` · ${formatCatalogDate(side.business_date)}` : ""}
      </p>
      {side.approved_at ? (
        <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">
          Reconciled {formatTimeLabel(side.approved_at)}
        </p>
      ) : null}
      {side.note?.trim() ? (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{side.note}</p>
      ) : null}
    </AuditField>
  );
}

function isCorrectableMatchedService(
  row: IndexedReconciliationRow,
  canCorrect?: boolean,
): boolean {
  if (!canCorrect) return false;
  if (row.comparison_status !== "matched") return false;
  const method = row.manager?.payment_method ?? row.payment_method;
  return method === "cash" || method === "transfer" || method === "pos";
}

function ReconciliationRow({
  row,
  showBusinessDate,
  primarySide,
  leftLabel,
  rightLabel,
  onVoidRequest,
  canCorrectPaymentMethod,
  onCorrectPaymentMethod,
}: {
  row: IndexedReconciliationRow;
  showBusinessDate: boolean;
  primarySide: ReconciliationViewerSide;
  leftLabel: string;
  rightLabel: string;
  onVoidRequest?: (row: IndexedReconciliationRow) => void;
  canCorrectPaymentMethod?: boolean;
  onCorrectPaymentMethod?: (row: IndexedReconciliationRow) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const status = row.comparison_status as ReconciliationComparisonStatus;
  const employeeMissing = status === "missing_employee_entry" || row.employee_amount === null;
  const managerMissing =
    status === "missing_manager_entry" ||
    status === "waiting_for_reconciliation" ||
    row.manager_amount === null;

  const employeeAmount = row.employee?.amount ?? row.employee_amount;
  const managerAmount = row.manager?.amount ?? row.manager_amount;
  const displayService =
    (primarySide === "employee" ? row.employee?.service_name : row.manager?.service_name) ??
    row.service_name;
  const payment = formatPayment(
    row.manager?.payment_method ?? row.employee?.payment_method ?? row.payment_method,
  );
  const time = formatTimeShort(
    (primarySide === "employee" ? row.employee?.occurred_at : row.manager?.occurred_at) ??
      row.occurred_at,
  );

  const leftAmount = primarySide === "employee" ? employeeAmount : managerAmount;
  const rightAmount = primarySide === "employee" ? managerAmount : employeeAmount;
  const leftMissing = primarySide === "employee" ? employeeMissing : managerMissing;
  const rightMissing = primarySide === "employee" ? managerMissing : employeeMissing;

  const toggle = () => setExpanded((v) => !v);
  const leftAuditLabel = primarySide === "employee" ? "Employee record" : "Manager record";
  const rightAuditLabel = primarySide === "employee" ? "Manager record" : "Employee record";
  const leftSide = primarySide === "employee" ? row.employee : row.manager;
  const rightSide = primarySide === "employee" ? row.manager : row.employee;
  const employeeVoided =
    row.employee?.is_voided ||
    status === "employee_record_voided" ||
    row.employee?.record_lifecycle === "deleted";
  const canVoidEmployee =
    primarySide === "employee" &&
    onVoidRequest &&
    row.employee_entry_id &&
    !employeeVoided &&
    status !== "pending_delete_confirmation";
  const canCorrect =
    isCorrectableMatchedService(row, canCorrectPaymentMethod) &&
    Boolean(row.manager_entry_id && onCorrectPaymentMethod);

  return (
    <li
      className={cn(
        "border-b border-[var(--border)]/70 last:border-b-0 transition-colors",
        employeeVoided && "opacity-55",
        rowHighlightFromComparison(status),
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
            {indexLabel(row)}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--foreground)] md:col-start-2">
            {displayService}
          </span>
          <span className="shrink-0 md:hidden">
            <ReconciliationComparisonBadge status={status} compact />
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform md:hidden",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-10 text-[10px] text-[var(--muted-foreground)] md:hidden">
          <span className="inline-flex items-center gap-1">
            <span className="uppercase tracking-wider opacity-60">{leftLabel}</span>
            <CompactAmount amount={leftAmount} missing={leftMissing} />
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="uppercase tracking-wider opacity-60">{rightLabel}</span>
            <CompactAmount amount={rightAmount} missing={rightMissing} />
          </span>
          {payment ? <span className="capitalize">{payment}</span> : null}
          <span className="tabular-nums">{time}</span>
          {showBusinessDate && row.business_date ? <span>{row.business_date}</span> : null}
        </div>

        <div className="hidden text-right md:col-start-3 md:block">
          <CompactAmount amount={leftAmount} missing={leftMissing} className="md:ml-auto" />
        </div>
        <div className="hidden text-right md:col-start-4 md:block">
          <CompactAmount amount={rightAmount} missing={rightMissing} className="md:ml-auto" />
        </div>
        <div className="hidden md:col-start-5 md:block">
          <ReconciliationComparisonBadge status={status} compact />
        </div>
        <span className="hidden truncate capitalize text-[11px] text-[var(--muted-foreground)] md:col-start-6 md:block">
          {payment ?? "—"}
        </span>
        <div className="hidden text-right text-[11px] tabular-nums text-[var(--muted-foreground)] md:col-start-7">
          {showBusinessDate && row.business_date ? (
            <span className="block text-[10px] leading-tight">{row.business_date.slice(5)}</span>
          ) : null}
          <span>{time}</span>
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
        <div className="border-t border-[var(--border)]/60 bg-[var(--muted)]/10 px-3 py-2.5 lg:px-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SideAudit label={leftAuditLabel} side={leftSide} missing={leftMissing} />
            <SideAudit label={rightAuditLabel} side={rightSide} missing={rightMissing} />
            <AuditField label="Status">
              <ReconciliationComparisonBadge status={status} />
              <p className="mt-1 capitalize text-[var(--muted-foreground)]">
                {row.reconciliation_status?.replace(/_/g, " ") ?? "—"}
              </p>
              {row.business_date ? (
                <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                  Transaction day {formatCatalogDate(row.business_date)}
                </p>
              ) : null}
              {row.reconciled_at ? (
                <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                  Reconciled {formatTimeLabel(row.reconciled_at)}
                </p>
              ) : null}
              {row.employee?.is_voided || row.employee?.pending_void_reason ? (
                <div className="mt-2">
                  <LedgerVoidBadge
                    meta={{
                      isVoided: row.employee?.is_voided,
                      voidReason: row.employee?.void_reason,
                      pendingVoidReason: row.employee?.pending_void_reason,
                    }}
                  />
                </div>
              ) : null}
            </AuditField>
          </div>
          {canVoidEmployee ? (
            <VoidActionBlock onVoid={() => onVoidRequest?.(row)} />
          ) : null}
          {canCorrect ? (
            <CorrectPaymentMethodBlock onCorrect={() => onCorrectPaymentMethod?.(row)} />
          ) : null}
          {row.payment_method_adjustments?.length ? (
            <PaymentMethodAdjustmentHistory
              adjustments={row.payment_method_adjustments}
              className="mt-3 border-t border-[var(--border)]/50 pt-3"
            />
          ) : null}
          <p className="mt-2 font-mono text-[10px] text-[var(--muted-foreground)]">
            {row.employee_entry_id ? `E:${row.employee_entry_id}` : ""}
            {row.employee_entry_id && row.manager_entry_id ? " · " : ""}
            {row.manager_entry_id ? `M:${row.manager_entry_id}` : ""}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function VoidActionBlock({ onVoid }: { onVoid: () => void }) {
  return (
    <div className="mt-3 border-t border-[var(--border)]/50 pt-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="rounded-full border-red-500/30 text-xs text-red-600 hover:bg-red-500/5 dark:text-red-400"
        onClick={(e) => {
          e.stopPropagation();
          onVoid();
        }}
      >
        Void record
      </Button>
    </div>
  );
}

function CorrectPaymentMethodBlock({ onCorrect }: { onCorrect: () => void }) {
  return (
    <div className="mt-3 border-t border-[var(--border)]/50 pt-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="rounded-full border-dashed text-xs"
        onClick={(e) => {
          e.stopPropagation();
          onCorrect();
        }}
      >
        Correct payment method
      </Button>
    </div>
  );
}

export function IndexedReconciliationTable({
  rows,
  loading,
  showBusinessDate = false,
  primarySide = "employee",
  employeeColumnLabel = "Employee",
  managerColumnLabel = "Manager",
  emptyTitle = "No service entries",
  emptyBody = "Indexed reconciliation rows appear here as services are recorded and reviewed.",
  onVoidRequest,
  canCorrectPaymentMethod,
  onCorrectPaymentMethod,
}: {
  rows: IndexedReconciliationRow[];
  loading: boolean;
  showBusinessDate?: boolean;
  /** Which stream appears in the left/first column for the logged-in viewer. */
  primarySide?: ReconciliationViewerSide;
  employeeColumnLabel?: string;
  managerColumnLabel?: string;
  emptyTitle?: string;
  emptyBody?: string;
  onVoidRequest?: (row: IndexedReconciliationRow) => void;
  canCorrectPaymentMethod?: boolean;
  onCorrectPaymentMethod?: (row: IndexedReconciliationRow) => void;
}) {
  const leftLabel = primarySide === "employee" ? employeeColumnLabel : managerColumnLabel;
  const rightLabel = primarySide === "employee" ? managerColumnLabel : employeeColumnLabel;

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)] shadow-[var(--shadow-card)]">
      <div className="md:min-w-[640px]">
        <div
          className={cn(
            "hidden border-b border-[var(--border)]/80 bg-[var(--muted)]/25 px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)] lg:px-4",
            DESKTOP_GRID,
          )}
        >
          <span>Index</span>
          <span>Service</span>
          <span className="text-right">{leftLabel}</span>
          <span className="text-right">{rightLabel}</span>
          <span>Status</span>
          <span>Pay</span>
          <span className="text-right">Time</span>
          <span className="sr-only">Details</span>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">{emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--muted-foreground)]">{emptyBody}</p>
          </div>
        ) : (
          <ul>
            {rows.map((row) => (
              <ReconciliationRow
                key={row.id}
                row={row}
                showBusinessDate={showBusinessDate}
                primarySide={primarySide}
                leftLabel={leftLabel}
                rightLabel={rightLabel}
                onVoidRequest={onVoidRequest}
                canCorrectPaymentMethod={canCorrectPaymentMethod}
                onCorrectPaymentMethod={onCorrectPaymentMethod}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
