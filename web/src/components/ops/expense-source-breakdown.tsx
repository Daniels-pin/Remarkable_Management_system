"use client";

import type { ExpenseSourceBreakdown } from "@/lib/ops-types";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

type ExpenseSourceBreakdownProps = {
  sources: ExpenseSourceBreakdown;
  className?: string;
  compact?: boolean;
  /** Admin sees total + operational vs payroll split; manager sees operational only. */
  variant?: "admin" | "manager";
  payrollCommission?: number;
};

export function ExpenseSourceBreakdownCard({
  sources,
  className,
  compact = false,
  variant = "manager",
  payrollCommission = 0,
}: ExpenseSourceBreakdownProps) {
  const isAdmin = variant === "admin";
  const operationalTotal = sources.operationalTotal || sources.total;
  const headlineTotal = isAdmin ? sources.total : operationalTotal;
  const shopOperational = sources.operationalShopCash ?? sources.shopCash;
  const adminOperational = sources.operationalAdminTransfer ?? sources.adminTransfer;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)]",
        compact ? "p-4" : "p-6",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {isAdmin ? "Expense breakdown" : "Operational expenses"}
      </p>
      <p
        className={cn(
          "mt-2 font-[family-name:var(--font-serif)] font-semibold tabular-nums tracking-tight text-[var(--foreground)]",
          compact ? "text-xl" : "text-2xl",
        )}
      >
        {formatNaira(headlineTotal)}
      </p>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        {isAdmin ? "Total expenses" : "Shop-running costs only"}
      </p>

      <div className={cn("mt-5 space-y-3", compact && "mt-4 space-y-2.5")}>
        {isAdmin ? (
          <>
            <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)]/80 pb-3">
              <span>
                <span className="text-sm font-medium text-[var(--foreground)]">Shop expenses</span>
                <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                  Fuel, rent, supplies, and other operational spend
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                {formatNaira(operationalTotal)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)]/80 pb-3">
              <span>
                <span className="text-sm font-medium text-[var(--foreground)]">
                  Salary & commission
                </span>
                <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                  Payroll and payout accounting
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                {formatNaira(payrollCommission)}
              </span>
            </div>
          </>
        ) : null}

        <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)]/80 pb-3">
          <span>
            <span className="text-sm font-medium text-[var(--foreground)]">Shop cash</span>
            <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
              Operational till spend
            </span>
          </span>
          <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
            {formatNaira(isAdmin ? shopOperational : sources.shopCash)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span>
            <span className="text-sm font-medium text-[var(--foreground)]">Admin covered</span>
            <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
              Transfer or personal funds
            </span>
          </span>
          <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
            {formatNaira(isAdmin ? adminOperational : sources.adminTransfer)}
          </span>
        </div>
      </div>
    </div>
  );
}
