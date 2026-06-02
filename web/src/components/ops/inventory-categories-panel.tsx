"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  createInventoryCategory,
  listInventoryCategories,
  updateInventoryCategory,
  type CategoryStatus,
  type InventoryCategoryItem,
} from "@/lib/api";
import { useAuth } from "@/components/providers/auth-provider";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CatalogStatusPill } from "@/components/ops/catalog-status-pill";

export function InventoryCategoriesPanel() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<InventoryCategoryItem[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<InventoryCategoryItem | null>(null);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listInventoryCategories({ includeInactive: true });
      setItems(res.items);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load inventory categories.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setDialogOpen(true);
  }

  function openEdit(row: InventoryCategoryItem) {
    setEditing(row);
    setName(row.name);
    setDialogOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Category name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateInventoryCategory(editing.id, { name: trimmed });
        toast.success("Category updated");
      } else {
        await createInventoryCategory({ name: trimmed });
        toast.success("Category created");
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Could not save category.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(row: InventoryCategoryItem, status: CategoryStatus) {
    if (!isAdmin) {
      toast.error("Only admins can archive categories.");
      return;
    }
    try {
      await updateInventoryCategory(row.id, { status });
      toast.success(status === "archived" ? "Category archived" : "Category updated");
      await load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Could not update category.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          Group products — Perfume, Drinks, Hair Products, and more.
        </p>
        <Button
          type="button"
          size="sm"
          className="rounded-full bg-[var(--foreground)] text-[var(--background)]"
          onClick={openCreate}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New category
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-6 py-10 text-center text-sm text-[var(--muted-foreground)]">
          No inventory categories yet. Create your first category to add products.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)]/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">
                    <CatalogStatusPill status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Link
                        href={`/barbershop/inventory/products?category=${row.id}`}
                        className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[var(--border)] px-3 text-xs font-medium hover:bg-[var(--muted)]/40"
                      >
                        Products
                      </Link>
                      {isAdmin && row.status === "active" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void setStatus(row, "archived")}
                        >
                          Archive
                        </Button>
                      ) : null}
                      {isAdmin && row.status !== "active" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void setStatus(row, "active")}
                        >
                          Restore
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[min(100%,24rem)]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Name</Label>
                <Input
                  id="cat-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Perfume"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]"
                disabled={saving}
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Create category"}
              </Button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
