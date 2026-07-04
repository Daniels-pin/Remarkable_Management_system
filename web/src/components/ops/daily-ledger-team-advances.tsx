"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import {
  ApiError,
  listTeamAdvances,
  type TeamAdvanceItem,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DailyLedgerTeamAdvances({
  businessDate,
  canManage,
}: {
  businessDate: string;
  canManage: boolean;
}) {
  const [items, setItems] = React.useState<TeamAdvanceItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTeamAdvances({ business_date: businessDate });
      setItems(res.items.filter((i) => i.status !== "voided"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load team advances.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [businessDate]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center text-sm text-[var(--muted-foreground)]">
        Loading team advances…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center shadow-[var(--shadow-card)]">
        <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
          No team advances for this day
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
          Cash borrowed and product credit taken by team members appear here — not as shop expenses.
        </p>
        {canManage ? (
          <Link
            href="/barbershop/team-advances"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-6 rounded-full")}
          >
            Record team advance
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Team advances · {items.length} record{items.length === 1 ? "" : "s"}
        </p>
        {canManage ? (
          <Link
            href="/barbershop/team-advances"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}
          >
            Manage
          </Link>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Details</th>
              <th className="px-4 py-3 font-medium text-right">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 font-medium">{item.employee_name ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{item.advance_type}</td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">
                  {item.advance_type === "product" && item.product_name
                    ? `${item.product_name} · Qty ${item.quantity}`
                    : item.reason}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatNaira(Number(item.amount))}
                </td>
                <td className="px-4 py-3 capitalize">{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
