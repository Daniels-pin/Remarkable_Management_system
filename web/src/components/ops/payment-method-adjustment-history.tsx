"use client";

import { formatServicePaymentMethod } from "@/components/ops/service-payment-method-select";
import type { PaymentMethodAdjustmentRow } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatAdjustmentDate(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PaymentMethodAdjustmentHistory({
  adjustments,
  className,
}: {
  adjustments: PaymentMethodAdjustmentRow[];
  className?: string;
}) {
  if (!adjustments.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {adjustments.map((adj) => (
        <div
          key={adj.id}
          className="rounded-[var(--radius-md)] border border-[var(--border)]/70 bg-[var(--background)]/60 px-3 py-2.5"
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Payment method adjusted
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {formatServicePaymentMethod(adj.original_method) ?? adj.original_method}
            {" → "}
            {formatServicePaymentMethod(adj.new_method) ?? adj.new_method}
          </p>
          <dl className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
            <div>
              <dt className="inline font-medium text-[var(--foreground)]/80">Corrected by: </dt>
              <dd className="inline">{adj.corrected_by_label ?? "Manager"}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--foreground)]/80">Reason:</dt>
              <dd className="mt-0.5 leading-relaxed">{adj.reason}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-[var(--foreground)]/80">Date: </dt>
              <dd className="inline tabular-nums">{formatAdjustmentDate(adj.created_at)}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
