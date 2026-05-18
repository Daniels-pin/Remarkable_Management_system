"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ApiError,
  listExpenseCategories,
  listSaleCategories,
  type CategoryItem,
  type CategoryStatus,
  updateExpenseCategory,
  updateSaleCategory,
} from "@/lib/api";

import {
  CatalogManagementList,
  type CatalogManageItem,
} from "./catalog-management-list";
import { CategoryFormDialog, type CategoryKind } from "./category-form-dialog";

const copy = {
  sale: {
    loadError: "Could not load sale categories.",
    emptyTitle: "No sale categories created yet",
    emptyBody: "Add your first sale category to enable Daily Ledger sales entries.",
    entityLabel: "sale category",
    disabled: "Sale category disabled",
    reactivated: "Sale category reactivated",
    deleted: "Sale category removed — history preserved",
    updateError: "Could not update sale category.",
  },
  expense: {
    loadError: "Could not load expense categories.",
    emptyTitle: "No expense categories created yet",
    emptyBody: "Add your first expense category to enable Daily Ledger expense entries.",
    entityLabel: "expense category",
    disabled: "Expense category disabled",
    reactivated: "Expense category reactivated",
    deleted: "Expense category removed — history preserved",
    updateError: "Could not update expense category.",
  },
} as const;

type CategoriesManagementPanelProps = {
  kind: CategoryKind;
};

export function CategoriesManagementPanel({ kind }: CategoriesManagementPanelProps) {
  const labels = copy[kind];
  const [loading, setLoading] = React.useState(true);
  const [categories, setCategories] = React.useState<CategoryItem[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CategoryItem | null>(null);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res =
        kind === "sale"
          ? await listSaleCategories({ includeInactive: true })
          : await listExpenseCategories({ includeInactive: true });
      setCategories(res.items);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(labels.loadError);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [kind, labels.loadError]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(category: CategoryItem) {
    setEditing(category);
    setFormOpen(true);
  }

  function handleSaved(saved: CategoryItem) {
    setCategories((prev) => {
      const without = prev.filter((c) => c.id !== saved.id);
      return [...without, saved].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
    });
  }

  async function patchStatus(
    item: CatalogManageItem,
    status: CategoryStatus,
    successMessage: string,
  ) {
    if (item.status === status) return;
    setUpdatingId(item.id);
    try {
      const saved =
        kind === "sale"
          ? await updateSaleCategory(item.id, { status })
          : await updateExpenseCategory(item.id, { status });
      handleSaved(saved);
      toast.success(successMessage);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(labels.updateError);
    } finally {
      setUpdatingId(null);
    }
  }

  const listItems: CatalogManageItem[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    created_at: c.created_at,
  }));

  const activeCount = categories.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-[var(--muted-foreground)]">
          {activeCount} active · {categories.length} total
        </p>
        <Button
          type="button"
          className="rounded-full bg-[var(--foreground)] text-[var(--background)]"
          onClick={openCreate}
        >
          <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
          New category
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading categories…</p>
      ) : categories.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-6 py-12 text-center">
          <p className="text-sm font-medium">{labels.emptyTitle}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{labels.emptyBody}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-full"
            onClick={openCreate}
          >
            Create category
          </Button>
        </div>
      ) : (
        <CatalogManagementList
          items={listItems}
          entityLabel={labels.entityLabel}
          updatingId={updatingId}
          onEdit={(item) => {
            const row = categories.find((c) => c.id === item.id);
            if (row) openEdit(row);
          }}
          onDisable={(item) => void patchStatus(item, "disabled", labels.disabled)}
          onReactivate={(item) => void patchStatus(item, "active", labels.reactivated)}
          onDelete={(item) => void patchStatus(item, "archived", labels.deleted)}
        />
      )}

      <CategoryFormDialog
        kind={kind}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        category={editing}
        onSaved={handleSaved}
      />
    </div>
  );
}
