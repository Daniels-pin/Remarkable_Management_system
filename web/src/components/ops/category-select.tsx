"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type CategoryItem } from "@/lib/api";
import { cn } from "@/lib/utils";

import { CatalogManageLink } from "./catalog-manage-link";
import { CategoryFormDialog, type CategoryKind } from "./category-form-dialog";

const ADD_NEW_VALUE = "__add_new_category__";

const copy = {
  sale: {
    label: "Sale category",
    empty: "No sale categories created yet",
    create: "Create category",
    addNew: "+ Add new category",
    loading: "Loading sale categories…",
    askManager: "Ask a manager to add sale categories before recording entries.",
  },
  expense: {
    label: "Expense category",
    empty: "No expense categories created yet",
    create: "Create category",
    addNew: "+ Add new category",
    loading: "Loading expense categories…",
    askManager: "Ask a manager to add expense categories before recording entries.",
  },
} as const;

type CategorySelectProps = {
  kind: CategoryKind;
  categories: CategoryItem[];
  value: string;
  onChange: (id: string) => void;
  onCategoriesChange: (categories: CategoryItem[]) => void;
  canManage: boolean;
  loading?: boolean;
  className?: string;
};

export function CategorySelect({
  kind,
  categories,
  value,
  onChange,
  onCategoriesChange,
  canManage,
  loading = false,
  className,
}: CategorySelectProps) {
  const labels = copy[kind];
  const [formOpen, setFormOpen] = React.useState(false);

  const activeCategories = categories.filter((c) => c.status === "active");

  React.useEffect(() => {
    if (!value) return;
    const selected = categories.find((c) => c.id === value);
    if (selected && selected.status !== "active") {
      onChange(activeCategories[0]?.id ?? "");
    }
  }, [activeCategories, categories, onChange, value]);

  function handleSaved(saved: CategoryItem) {
    const without = categories.filter((c) => c.id !== saved.id);
    const next = [...without, saved].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    );
    onCategoriesChange(next);
    if (saved.status === "active") {
      onChange(saved.id);
    }
  }

  function handleSelectChange(next: string) {
    if (next === ADD_NEW_VALUE) {
      setFormOpen(true);
      return;
    }
    onChange(next);
  }

  if (!loading && activeCategories.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <Label>{labels.label}</Label>
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)]/20 px-4 py-5 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">{labels.empty}</p>
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 rounded-full"
              onClick={() => setFormOpen(true)}
            >
              {labels.create}
            </Button>
          ) : (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">{labels.askManager}</p>
          )}
        </div>
        {canManage ? (
          <CategoryFormDialog
            kind={kind}
            open={formOpen}
            onOpenChange={setFormOpen}
            onSaved={handleSaved}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{labels.label}</Label>
      <select
        value={value}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
        disabled={loading}
      >
        {activeCategories.length === 0 ? (
          <option value="">{labels.loading}</option>
        ) : (
          activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))
        )}
        {canManage ? (
          <option value={ADD_NEW_VALUE} className="font-medium">
            {labels.addNew}
          </option>
        ) : null}
      </select>

      {canManage ? (
        <>
          <CatalogManageLink
            href={`/barbershop/settings/catalog?tab=${kind}`}
            label="Edit, disable, or remove categories"
            className="mt-1 block"
          />
          <CategoryFormDialog
            kind={kind}
            open={formOpen}
            onOpenChange={setFormOpen}
            onSaved={handleSaved}
          />
        </>
      ) : null}
    </div>
  );
}
