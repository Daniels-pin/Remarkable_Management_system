"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  createExpenseCategory,
  createSaleCategory,
  type CategoryItem,
  type CategoryStatus,
  updateExpenseCategory,
  updateSaleCategory,
} from "@/lib/api";

export type CategoryKind = "sale" | "expense";

type CategoryFormDialogProps = {
  kind: CategoryKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryItem | null;
  onSaved: (category: CategoryItem) => void;
};

const statusOptions: { value: CategoryStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
  { value: "archived", label: "Archived" },
];

const copy = {
  sale: {
    newTitle: "New sale category",
    editTitle: "Edit sale category",
    placeholder: "e.g. Perfume",
    created: "Sale category created",
    updated: "Sale category updated",
  },
  expense: {
    newTitle: "New expense category",
    editTitle: "Edit expense category",
    placeholder: "e.g. Fuel",
    created: "Expense category created",
    updated: "Expense category updated",
  },
} as const;

export function CategoryFormDialog({
  kind,
  open,
  onOpenChange,
  category,
  onSaved,
}: CategoryFormDialogProps) {
  const labels = copy[kind];
  const isEdit = Boolean(category);
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<CategoryStatus>("active");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setStatus(category?.status ?? "active");
  }, [open, category]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a category name.");
      return;
    }

    setSaving(true);
    try {
      const saved =
        isEdit && category
          ? kind === "sale"
            ? await updateSaleCategory(category.id, { name: trimmed, status })
            : await updateExpenseCategory(category.id, { name: trimmed, status })
          : kind === "sale"
            ? await createSaleCategory({ name: trimmed, status })
            : await createExpenseCategory({ name: trimmed, status });
      toast.success(isEdit ? labels.updated : labels.created, {
        description: trimmed,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error(isEdit ? "Could not update category." : "Could not create category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,24rem)]">
        <DialogHeader>
          <DialogTitle>{isEdit ? labels.editTitle : labels.newTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form onSubmit={(e) => void submit(e)} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor={`${kind}-cat-name`}>Category name</Label>
              <Input
                id={`${kind}-cat-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={labels.placeholder}
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${kind}-cat-status`}>Status</Label>
              <select
                id={`${kind}-cat-status`}
                value={status}
                onChange={(e) => setStatus(e.target.value as CategoryStatus)}
                className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]"
              disabled={saving}
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create category"}
            </Button>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
