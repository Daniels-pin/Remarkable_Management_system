"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApiError,
  listPersonalConsumptions,
  type PersonalConsumptionItem,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

function DetailDialog({
  item,
  open,
  onOpenChange,
}: {
  item: PersonalConsumptionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,28rem)]">
        <DialogHeader>
          <DialogTitle>Personal consumption</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3 text-sm">
          {[
            ["Product", item.product_name ?? "—"],
            ["Quantity", String(item.quantity)],
            ["Selling value", formatNaira(Number(item.total_selling_value))],
            ["Cost value", formatNaira(Number(item.total_cost_value))],
            ["Consumed by", item.consumed_by_label ?? "—"],
            ["Recorded by", item.recorded_by_label ?? "—"],
            ["Business date", new Date(item.business_date).toLocaleDateString("en-NG")],
            ["Reason", item.reason],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <span className="text-[var(--muted-foreground)]">{label}</span>
              <span className="text-right font-medium">{value}</span>
            </div>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function DailyLedgerPersonalConsumption({
  businessDate,
  canManage,
}: {
  businessDate: string;
  canManage: boolean;
}) {
  const [items, setItems] = React.useState<PersonalConsumptionItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [detailTarget, setDetailTarget] = React.useState<PersonalConsumptionItem | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPersonalConsumptions({ business_date: businessDate });
      setItems(res.items.filter((i) => i.status !== "voided"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load personal consumption.");
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
        Loading personal consumption…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center shadow-[var(--shadow-card)]">
        <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
          No personal consumption for this day
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
          Products taken for personal use by admin or manager appear here — not sales, expenses, or
          team advances.
        </p>
        {canManage ? (
          <Link
            href="/barbershop/personal-consumption"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-6 rounded-full")}
          >
            Record personal consumption
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Personal consumption · {items.length} record{items.length === 1 ? "" : "s"}
          </p>
          {canManage ? (
            <Link
              href="/barbershop/personal-consumption"
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
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Consumed by</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium text-right">Cost value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer hover:bg-[var(--muted)]/30"
                  onClick={() => {
                    setDetailTarget(item);
                    setDetailOpen(true);
                  }}
                >
                  <td className="px-4 py-3 font-medium">{item.product_name ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-3">{item.consumed_by_label ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{item.reason}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatNaira(Number(item.total_cost_value))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <DetailDialog item={detailTarget} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}
