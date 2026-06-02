"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  adjustInventoryStock,
  getInventoryProduct,
  stockInInventoryProduct,
  type InventoryProductDetail,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { useAuth } from "@/components/providers/auth-provider";
import { SummaryMetricCard } from "@/components/ops/summary-metric-card";

type Props = { productId: string };

export function InventoryProductDetailPanel({ productId }: Props) {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const [loading, setLoading] = React.useState(true);
  const [product, setProduct] = React.useState<InventoryProductDetail | null>(null);
  const [stockQty, setStockQty] = React.useState("");
  const [stockNote, setStockNote] = React.useState("");
  const [adjustDelta, setAdjustDelta] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const row = await getInventoryProduct(productId);
      setProduct(row);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load product.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function doStockIn(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(stockQty);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Enter a positive quantity.");
      return;
    }
    setSaving(true);
    try {
      await stockInInventoryProduct(productId, {
        quantity: q,
        note: stockNote.trim() || null,
      });
      toast.success("Stock added");
      setStockQty("");
      setStockNote("");
      await load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Stock in failed.");
    } finally {
      setSaving(false);
    }
  }

  async function doAdjust(e: React.FormEvent) {
    e.preventDefault();
    const d = Number(adjustDelta);
    if (!Number.isFinite(d) || d === 0) {
      toast.error("Enter a non-zero adjustment.");
      return;
    }
    setSaving(true);
    try {
      await adjustInventoryStock(productId, {
        quantity_delta: d,
        note: "Admin adjustment",
      });
      toast.success("Stock adjusted");
      setAdjustDelta("");
      await load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Adjustment failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !product) {
    return <p className="text-sm text-[var(--muted-foreground)]">Loading product…</p>;
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
          {product.category_name}
        </p>
        <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight">
          {product.name}
        </h2>
        {product.is_low_stock ? (
          <p className="text-sm text-amber-600">Low stock — {product.stock_quantity} remaining</p>
        ) : null}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetricCard label="Current stock" value={String(product.stock_quantity)} />
        <SummaryMetricCard
          label="Inventory value"
          value={formatNaira(Number(product.inventory_value))}
        />
        <SummaryMetricCard
          label="Revenue (all time)"
          value={formatNaira(Number(product.revenue_generated))}
        />
        <SummaryMetricCard
          label="Profit (all time)"
          value={formatNaira(Number(product.profit_generated))}
          tone="positive"
        />
      </div>

      <div className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            Cost price
          </p>
          <p className="mt-1 font-medium">{formatNaira(Number(product.cost_price))}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            Selling price
          </p>
          <p className="mt-1 font-medium">
            {formatNaira(Number(product.default_selling_price))}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            Units sold
          </p>
          <p className="mt-1 font-medium">{product.units_sold}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={(e) => void doStockIn(e)}
          className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4"
        >
          <p className="text-sm font-medium">Stock in</p>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input
              inputMode="numeric"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input value={stockNote} onChange={(e) => setStockNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={saving} size="sm">
            Add stock
          </Button>
        </form>

        {isAdmin ? (
          <form
            onSubmit={(e) => void doAdjust(e)}
            className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-4"
          >
            <p className="text-sm font-medium">Adjust stock (admin)</p>
            <div className="space-y-1.5">
              <Label>Signed delta (+/−)</Label>
              <Input
                inputMode="numeric"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={saving} size="sm" variant="outline">
              Apply adjustment
            </Button>
          </form>
        ) : null}
      </div>

      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Stock movement history
        </p>
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30 uppercase tracking-wider text-[var(--muted-foreground)]">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Δ</th>
                <th className="px-3 py-2 text-right">After</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {product.stock_movements.map((m) => (
                <tr key={m.id} className="border-b border-[var(--border)]/50 last:border-0">
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">
                    {m.created_at
                      ? new Date(m.created_at).toLocaleString("en-NG", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 capitalize">{m.movement_type.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.quantity_after}</td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">{m.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
