"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";
import { formatLedgerIndexLabel } from "@/lib/ledger-index";
import {
  acceptBarberPendingVoid,
  type PendingVoidRequest,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import { toast } from "sonner";

type PendingVoidReviewProps = {
  items: PendingVoidRequest[];
  onResolved: () => void;
};

export function PendingVoidReview({ items, onResolved }: PendingVoidReviewProps) {
  const [acceptingId, setAcceptingId] = React.useState<string | null>(null);

  if (items.length === 0) return null;

  const accept = async (entryId: string) => {
    setAcceptingId(entryId);
    try {
      await acceptBarberPendingVoid(entryId);
      toast.success("Void accepted — totals will recalculate.");
      onResolved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not accept void.");
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <section className="space-y-3 rounded-[var(--radius-lg)] border border-amber-500/25 bg-amber-500/[0.04] p-4 shadow-[var(--shadow-card)]">
      <div>
        <h3 className="text-sm font-medium text-[var(--foreground)]">Pending void requests</h3>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
          A manager requested to void these records. Accept to remove them from your active totals.
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.entry_id}
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--card)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
                {formatLedgerIndexLabel("service", item.index, item.index_label)}
              </p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {item.service_name}{" "}
                <span className="tabular-nums">{formatNaira(Number(item.amount))}</span>
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                {item.pending_void_by_label
                  ? `Manager ${item.pending_void_by_label} wants to void`
                  : "Void requested"}
                {item.pending_void_reason ? ` · ${item.pending_void_reason}` : ""}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0 rounded-full"
              disabled={acceptingId === item.entry_id}
              onClick={() => void accept(item.entry_id)}
            >
              {acceptingId === item.entry_id ? "Accepting…" : "Accept void"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
