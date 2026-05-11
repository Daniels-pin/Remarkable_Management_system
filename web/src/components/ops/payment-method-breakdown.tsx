"use client";

import { formatCompactNaira, formatNaira } from "@/lib/format";
import type { FinancialSnapshot, PaymentMethod } from "@/lib/ops-types";

const ORDER: PaymentMethod[] = ["cash", "card", "transfer", "pos"];

const LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Transfer",
  pos: "POS",
};

export function PaymentMethodBreakdown({
  snapshot,
  className,
}: {
  snapshot: FinancialSnapshot;
  className?: string;
}) {
  const channelTotal = ORDER.reduce((sum, key) => sum + snapshot.paymentMethods[key], 0);
  const hasSplit = channelTotal > 0;

  return (
    <div className={className}>
      <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Payment methods
      </p>
      {!hasSplit ? (
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          No inflows by channel recorded for this period yet. Once settled tickets post, the
          split bar fills automatically.
        </p>
      ) : null}
      <div className="flex h-2 gap-px overflow-hidden rounded-full bg-[var(--muted)]">
        {ORDER.map((key) => {
          const v = snapshot.paymentMethods[key];
          return (
            <div
              key={key}
              title={`${LABELS[key]} · ${formatNaira(v)}`}
              className="min-w-[6px] first:rounded-l-full last:rounded-r-full"
              style={{
                flexGrow: hasSplit ? Math.max(1, v) : 1,
                background:
                  key === "cash"
                    ? "color-mix(in oklab, var(--foreground) 55%, transparent)"
                    : key === "card"
                      ? "color-mix(in oklab, var(--foreground) 38%, transparent)"
                      : key === "transfer"
                        ? "color-mix(in oklab, var(--foreground) 24%, transparent)"
                        : "color-mix(in oklab, var(--muted-foreground) 45%, transparent)",
              }}
            />
          );
        })}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {ORDER.map((key) => (
          <li
            key={key}
            className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--card)] px-3 py-2.5 text-sm"
          >
            <span className="text-[var(--muted-foreground)]">{LABELS[key]}</span>
            <span className="font-medium tabular-nums text-[var(--foreground)]">
              {formatCompactNaira(snapshot.paymentMethods[key])}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
