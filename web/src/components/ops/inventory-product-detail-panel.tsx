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
  listInventoryCategories,
  stockInInventoryProduct,
  updateInventoryProduct,
  type CategoryStatus,
  type InventoryCategoryItem,
  type InventoryProductDetail,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { useAuth } from "@/components/providers/auth-provider";
import { SummaryMetricCard } from "@/components/ops/summary-metric-card";
import { CatalogStatusPill } from "@/components/ops/catalog-status-pill";
import { InventoryProductFormDialog } from "@/components/ops/inventory-product-form-dialog";

type Props = { productId: string };

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  opening: "Stock in (opening)",
  stock_in: "Stock in",
  sale: "Sale",
  team_advance: "Team advance",
  personal_consumption: "Personal consumption",
  void_restore: "Void restore",
  adjustment: "Stock adjustment",
};

function formatMovementType(type: string): string {
  return MOVEMENT_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

export function InventoryProductDetailPanel({ productId }: Props) {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const canManageStatus = session?.role === "admin" || session?.role === "manager";
  const [loading, setLoading] = React.useState(true);
  const [product, setProduct] = React.useState<InventoryProductDetail | null>(null);
  const [categories, setCategories] = React.useState<InventoryCategoryItem[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [statusBusy, setStatusBusy] = React.useState(false);
  const [stockQty, setStockQty] = React.useState("");
  const [stockNote, setStockNote] = React.useState("");
  const [adjustDelta, setAdjustDelta] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [row, cats] = await Promise.all([
        getInventoryProduct(productId),
        listInventoryCategories({ includeInactive: true }),
      ]);
      setProduct(row);
      setCategories(cats.items);
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

  async function setStatus(next: CategoryStatus) {
    if (!product) return;
    setStatusBusy(true);
    try {
      await updateInventoryProduct(product.id, { status: next });
      toast.success("Product status updated");
      await load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Could not update status.");
    } finally {
      setStatusBusy(false);
    }
  }

  if (loading || !product) {
    return <p className="text-sm text-[var(--muted-foreground)]">Loading product…</p>;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
            {product.category_name}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight">
              {product.name}
            </h2>
            <CatalogStatusPill status={product.status} />
          </div>
          {product.is_low_stock ? (
            <p className="text-sm text-amber-600">Low stock — {product.stock_quantity} remaining</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setFormOpen(true)}>
            Edit product
          </Button>
          {canManageStatus && product.status === "active" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={statusBusy}
              onClick={() => void setStatus("disabled")}
            >
              Disable
            </Button>
          ) : null}
          {canManageStatus && product.status !== "active" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={statusBusy}
              onClick={() => void setStatus("active")}
            >
              Reactivate
            </Button>
          ) : null}
          {canManageStatus && product.status !== "archived" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={statusBusy}
              className="text-red-600 dark:text-red-400"
              onClick={() => void setStatus("archived")}
            >
              Archive
            </Button>
          ) : null}
        </div>
      </header>

      {product.image_url ? (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image_url}
            alt={product.name}
            className="max-h-48 w-full object-contain p-4"
          />
        </div>
      ) : null}

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
          Product sales history
        </p>
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30 uppercase tracking-wider text-[var(--muted-foreground)]">
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                {isAdmin ? <th className="px-3 py-2 text-right">Profit</th> : null}
                <th className="px-3 py-2">Recorded by</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {(product.sales_history ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="px-3 py-6 text-center text-[var(--muted-foreground)]"
                  >
                    No sales recorded yet.
                  </td>
                </tr>
              ) : (
                (product.sales_history ?? []).map((sale) => (
                  <tr key={sale.id} className="border-b border-[var(--border)]/50 last:border-0">
                    <td className="px-3 py-2">{sale.product_name ?? product.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{sale.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNaira(Number(sale.revenue))}
                    </td>
                    {isAdmin ? (
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatNaira(Number(sale.profit))}
                      </td>
                    ) : null}
                    <td className="px-3 py-2">{sale.recorded_by_label ?? "—"}</td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">
                      {sale.occurred_at
                        ? new Date(sale.occurred_at).toLocaleString("en-NG", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
                  <td className="px-3 py-2">{formatMovementType(m.movement_type)}</td>
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

      <InventoryProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        editing={product}
        onSaved={() => void load()}
      />
    </div>
  );
}
