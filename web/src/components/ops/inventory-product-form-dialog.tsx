"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  createInventoryProduct,
  updateInventoryProduct,
  type CategoryStatus,
  type InventoryCategoryItem,
  type InventoryProductItem,
} from "@/lib/api";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: InventoryCategoryItem[];
  editing: InventoryProductItem | null;
  onSaved: () => void;
};

export function InventoryProductFormDialog({
  open,
  onOpenChange,
  categories,
  editing,
  onSaved,
}: Props) {
  const [categoryId, setCategoryId] = React.useState("");
  const [name, setName] = React.useState("");
  const [costPrice, setCostPrice] = React.useState("");
  const [sellPrice, setSellPrice] = React.useState("");
  const [openingStock, setOpeningStock] = React.useState("0");
  const [lowStock, setLowStock] = React.useState("5");
  const [imageUrl, setImageUrl] = React.useState("");
  const [status, setStatus] = React.useState<CategoryStatus>("active");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setCategoryId(editing.category_id);
      setName(editing.name);
      setCostPrice(editing.cost_price);
      setSellPrice(editing.default_selling_price);
      setOpeningStock("0");
      setLowStock(String(editing.low_stock_threshold));
      setImageUrl(editing.image_url ?? "");
      setStatus(editing.status);
    } else {
      const first = categories.find((c) => c.status === "active");
      setCategoryId(first?.id ?? "");
      setName("");
      setCostPrice("");
      setSellPrice("");
      setOpeningStock("0");
      setLowStock("5");
      setImageUrl("");
      setStatus("active");
    }
  }, [open, editing, categories]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cost = Number(costPrice.replace(/,/g, ""));
    const sell = Number(sellPrice.replace(/,/g, ""));
    const openStock = Number(openingStock);
    const low = Number(lowStock);
    if (!categoryId || !name.trim() || !Number.isFinite(cost) || cost < 0) {
      toast.error("Complete all required fields.");
      return;
    }
    if (!Number.isFinite(sell) || sell < 0) {
      toast.error("Enter a valid selling price.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateInventoryProduct(editing.id, {
          category_id: categoryId,
          name: name.trim(),
          cost_price: cost,
          default_selling_price: sell,
          low_stock_threshold: low,
          image_url: imageUrl.trim() || null,
          status,
        });
        toast.success("Product updated");
      } else {
        await createInventoryProduct({
          category_id: categoryId,
          name: name.trim(),
          cost_price: cost,
          default_selling_price: sell,
          opening_stock: Number.isFinite(openStock) ? Math.max(0, openStock) : 0,
          low_stock_threshold: Number.isFinite(low) ? Math.max(0, low) : 0,
          image_url: imageUrl.trim() || null,
        });
        toast.success("Product created");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,28rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                required
              >
                {categories
                  .filter((c) => c.status === "active")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Product name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cost price (₦)</Label>
                <Input
                  inputMode="decimal"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Default sell (₦)</Label>
                <Input
                  inputMode="decimal"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  required
                />
              </div>
            </div>
            {!editing ? (
              <div className="space-y-1.5">
                <Label>Opening stock</Label>
                <Input
                  inputMode="numeric"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Low stock alert at</Label>
              <Input
                inputMode="numeric"
                value={lowStock}
                onChange={(e) => setLowStock(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Image URL (optional)</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
            </div>
            {editing ? (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CategoryStatus)}
                  className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            ) : null}
            <Button
              type="submit"
              disabled={saving}
              className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]"
            >
              {saving ? "Saving…" : editing ? "Save product" : "Create product"}
            </Button>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
