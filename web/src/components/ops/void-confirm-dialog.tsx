"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNaira } from "@/lib/format";
import { formatLedgerIndexLabel } from "@/lib/ledger-index";
import type { LedgerEntryType } from "@/lib/ops-types";
import { cn } from "@/lib/utils";

export type VoidConfirmContext =
  | "team_member_service"
  | "manager_service"
  | "sale"
  | "expense";

export type VoidConfirmTarget = {
  id: string;
  index: number;
  indexLabel?: string;
  type: LedgerEntryType;
  amount: number;
  description: string;
  employeeName?: string | null;
};

type VoidConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: VoidConfirmTarget | null;
  context: VoidConfirmContext;
  onConfirm: (reason: string) => Promise<void>;
};

const CONTEXT_WARNINGS: Record<VoidConfirmContext, string[]> = {
  team_member_service: [
    "This action will void the transaction permanently from active financial calculations.",
    "This action cannot be undone automatically.",
    "Approved totals, payout, and commission will recalculate immediately.",
    "Reconciliation status will update for this index.",
  ],
  manager_service: [
    "This action will void the transaction permanently from active financial calculations.",
    "This action cannot be undone automatically.",
    "The employee tied to this index must confirm before totals are removed.",
    "Reconciliation state will update after they accept.",
  ],
  sale: [
    "This action will void the transaction permanently from active financial calculations.",
    "This action cannot be undone automatically.",
    "Operational financial totals will update immediately.",
  ],
  expense: [
    "This action will void the transaction permanently from active financial calculations.",
    "This action cannot be undone automatically.",
    "Operational financial totals will update immediately.",
  ],
};

function typeLabel(type: LedgerEntryType) {
  if (type === "service") return "Service";
  if (type === "sale") return "Sale";
  return "Expense";
}

function VoidSummary({
  target,
  indexDisplay,
}: {
  target: VoidConfirmTarget;
  indexDisplay: string;
}) {
  return <SummaryBlock target={target} indexDisplay={indexDisplay} />;
}

function SummaryBlock({
  target,
  indexDisplay,
}: {
  target: VoidConfirmTarget;
  indexDisplay: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--muted)]/20 px-3 py-2.5 text-sm">
      <p className="font-mono text-[11px] font-medium text-[var(--muted-foreground)]">
        {indexDisplay}
      </p>
      <p className="mt-1 font-medium text-[var(--foreground)]">{target.description}</p>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        {typeLabel(target.type)}
        {target.employeeName ? ` · ${target.employeeName}` : ""}
      </p>
      <p className="mt-2 text-base font-medium tabular-nums text-[var(--foreground)]">
        {formatNaira(target.amount)}
      </p>
    </div>
  );
}

function VoidWarnings({ warnings }: { warnings: string[] }) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-[var(--radius-md)] border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <ul className="space-y-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function VoidReasonField({
  reason,
  onChange,
}: {
  reason: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="void-reason" className="text-xs font-medium">
        Void reason <span className="text-red-600">*</span>
      </Label>
      <Input
        id="void-reason"
        value={reason}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Duplicate entry"
        className="rounded-[var(--radius-md)]"
        autoComplete="off"
      />
      <p className="text-[10px] text-[var(--muted-foreground)]">
        Required — every void must include an explanation for audit history.
      </p>
    </div>
  );
}

export function VoidConfirmDialog({
  open,
  onOpenChange,
  target,
  context,
  onConfirm,
}: VoidConfirmDialogProps) {
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setReason("");
      setSubmitting(false);
    }
  }, [open]);

  const canConfirm = reason.trim().length > 0 && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!target) return null;

  const indexDisplay = formatLedgerIndexLabel(
    target.type,
    target.index,
    target.indexLabel,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,26rem)]">
        <DialogHeader>
          <DialogTitle>Void record</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <VoidSummary target={target} indexDisplay={indexDisplay} />
          <VoidWarnings warnings={CONTEXT_WARNINGS[context]} />
          <VoidReasonField reason={reason} onChange={setReason} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full bg-red-600 text-white hover:bg-red-600/90"
              onClick={() => void handleConfirm()}
              disabled={!canConfirm}
            >
              {submitting ? "Voiding…" : "Confirm void"}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
