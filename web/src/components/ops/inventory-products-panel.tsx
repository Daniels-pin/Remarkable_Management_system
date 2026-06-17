"use client";

import { AlertTriangle, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ApiError,
  listInventoryCategories,
  listInventoryProducts,
  listLowStockProducts,
  updateInventoryProduct,
  type CategoryStatus,
  type InventoryCategoryItem,
  type InventoryProductItem,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { InventoryProductFormDialog } from "@/components/ops/inventory-product-form-dialog";
import { CatalogStatusPill } from "@/components/ops/catalog-status-pill";
import { useAuth } from "@/components/providers/auth-provider";

export function InventoryProductsPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get("category") ?? "";
  const { session } = useAuth();
  const canManageStatus = session?.role === "admin" || session?.role === "manager";

  const [loading, setLoading] = React.useState(true);
  const [categories, setCategories] = React.useState<InventoryCategoryItem[]>([]);
  const [products, setProducts] = React.useState<InventoryProductItem[]>([]);
  const [lowStock, setLowStock] = React.useState<InventoryProductItem[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<InventoryProductItem | null>(null);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cats, prods, alerts] = await Promise.all([
        listInventoryCategories({ includeInactive: true }),
        listInventoryProducts({
          categoryId: categoryFilter || undefined,
          includeInactive: true,
        }),
        listLowStockProducts(),
      ]);
      setCategories(cats.items);
      setProducts(prods.items);
      setLowStock(alerts.items);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function setProductStatus(product: InventoryProductItem, next: CategoryStatus) {
    setUpdatingId(product.id);
    try {
      await updateInventoryProduct(product.id, { status: next });
      toast.success(
        next === "active" ? "Product reactivated" : next === "disabled" ? "Product disabled" : "Product archived",
      );
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not update product status.");
    } finally {
      setUpdatingId(null);
    }
  }

  function openEdit(product: InventoryProductItem) {
    setEditing(product);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      {lowStock.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Low stock alerts</p>
              <ul className="mt-1 text-xs text-[var(--muted-foreground)]">
                {lowStock.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    {p.name} — {p.stock_quantity} left (alert at {p.low_stock_threshold})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={categoryFilter}
          onChange={(e) => {
            const v = e.target.value;
            router.replace(
              v ? `/barbershop/inventory/products?category=${v}` : "/barbershop/inventory/products",
            );
          }}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          className="rounded-full bg-[var(--foreground)] text-[var(--background)]"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New product
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
      ) : products.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-6 py-10 text-center text-sm text-[var(--muted-foreground)]">
          No products yet. Add a category first, then create products with cost, price, and stock.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                <th className="px-4 py-2.5 font-medium text-right">Sell</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-[var(--border)]/60 last:border-0 ${p.is_low_stock ? "bg-amber-500/5" : ""}`}
                >
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{p.category_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.stock_quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNaira(Number(p.default_selling_price))}
                  </td>
                  <td className="px-4 py-3">
                    <CatalogStatusPill status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-[var(--radius-md)] px-3 text-xs"
                        onClick={() => openEdit(p)}
                      >
                        Edit
                      </Button>
                      <Link
                        href={`/barbershop/inventory/products/${p.id}`}
                        className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[var(--border)] px-3 text-xs font-medium hover:bg-[var(--muted)]/40"
                      >
                        View
                      </Link>
                      {canManageStatus ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={updatingId === p.id}
                              aria-label="Product actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(p)}>Edit</DropdownMenuItem>
                            {p.status === "active" ? (
                              <DropdownMenuItem onClick={() => void setProductStatus(p, "disabled")}>
                                Disable
                              </DropdownMenuItem>
                            ) : null}
                            {p.status !== "active" ? (
                              <DropdownMenuItem onClick={() => void setProductStatus(p, "active")}>
                                Reactivate
                              </DropdownMenuItem>
                            ) : null}
                            {p.status !== "archived" ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600 dark:text-red-400"
                                  onClick={() => void setProductStatus(p, "archived")}
                                >
                                  Archive
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InventoryProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        editing={editing}
        onSaved={() => void load()}
      />
    </div>
  );
}
