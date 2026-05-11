"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatNaira } from "@/lib/format";
import type { LedgerTransaction } from "@/lib/ops-types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: LedgerTransaction | null;
  onAccept: (transactionId: string) => void;
  onReject: (transactionId: string, reason: string) => void;
};

export function ReconciliationReviewDialog({
  open,
  onOpenChange,
  transaction,
  onAccept,
  onReject,
}: Props) {
  const [rejectReason, setRejectReason] = React.useState("");
  const [mode, setMode] = React.useState<"review" | "reject">("review");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setRejectReason("");
      setMode("review");
    }
    onOpenChange(next);
  }

  const rec = transaction?.reconciliation;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[min(100%,24rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reconciliation review</DialogTitle>
          <DialogDescription>
            Compare the floor entry with the manager-approved amount before settling.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {!transaction || !rec ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nothing to review.</p>
          ) : mode === "review" ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                    Original
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums">
                    {formatNaira(rec.originalAmount)}
                  </p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                    Manager approved
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums">
                    {formatNaira(rec.approvedAmount)}
                  </p>
                </div>
              </div>
              <div className="rounded-[var(--radius-md)] border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-sm">
                <span className="text-[var(--muted-foreground)]">Difference </span>
                <span className="font-semibold tabular-nums text-[var(--foreground)]">
                  {formatNaira(rec.approvedAmount - rec.originalAmount)}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  History
                </p>
                <ul className="mt-2 space-y-2">
                  {rec.history.map((h, i) => (
                    <li
                      key={`${h.at}-${i}`}
                      className="flex items-start justify-between gap-3 text-xs"
                    >
                      <span className="text-[var(--muted-foreground)]">{h.label}</span>
                      <span className="shrink-0 tabular-nums text-[var(--foreground)]">
                        {formatNaira(h.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  className="flex-1 rounded-full bg-[var(--foreground)] text-[var(--background)]"
                  onClick={() => {
                    onAccept(transaction.id);
                    toast.success("Reconciliation accepted");
                    handleOpenChange(false);
                  }}
                >
                  Accept reconciliation
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-full border-dashed"
                  onClick={() => setMode("reject")}
                >
                  Reject & review again
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Label htmlFor="rej-reason">Reason required</Label>
              <textarea
                id="rej-reason"
                required
                rows={4}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className={cn(
                  "w-full resize-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] shadow-[var(--shadow-inset)] placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/25",
                )}
                placeholder="Describe what still looks incorrect…"
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setMode("review")}>
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="rounded-full"
                  disabled={rejectReason.trim().length < 4}
                  onClick={() => {
                    onReject(transaction.id, rejectReason.trim());
                    toast.message("Returned for review", {
                      description: "Your manager has been notified.",
                    });
                    handleOpenChange(false);
                  }}
                >
                  Submit rejection
                </Button>
              </div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
