"use client";

import { formatNaira } from "@/lib/format";
import type { RevenuePaymentMethods } from "@/lib/financial-month-metrics";
import { cn } from "@/lib/utils";

const BREAKDOWN_ROWS: { key: keyof RevenuePaymentMethods; label: string }[] = [
  { key: "cash", label: "Cash (Shop)" },
  { key: "transfer", label: "Transfer" },
  { key: "pos", label: "POS" },
];

type Props = {
  totalRevenue: number | null;
  paymentMethods: RevenuePaymentMethods | null;
  className?: string;
};

function metricValue(value: number | null): string {
  return value != null ? formatNaira(value) : "—";
}

export function TotalRevenueMetricCard({ totalRevenue, paymentMethods, className }: Props) {
  const breakdownTotal = paymentMethods
    ? paymentMethods.cash + paymentMethods.transfer + paymentMethods.pos
    : null;
  const hasBreakdown = breakdownTotal != null && breakdownTotal > 0;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 text-left shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Total revenue
      </p>
      <p className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-[1.65rem]">
        {metricValue(totalRevenue)}
      </p>
      {hasBreakdown && paymentMethods ? (
        <div className="space-y-1.5 border-t border-[var(--border)]/80 pt-3">
          {BREAKDOWN_ROWS.map(({ key, label }) => (
            <div key={key} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-[var(--muted-foreground)]">{label}</span>
              <span className="font-medium tabular-nums text-[var(--foreground)]">
                {formatNaira(paymentMethods[key])}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
          Combined service and inventory revenue
        </p>
      )}
    </div>
  );
}
