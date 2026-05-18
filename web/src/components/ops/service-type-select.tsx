"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type ServiceTypeItem } from "@/lib/api";
import { cn } from "@/lib/utils";

import { CatalogManageLink } from "./catalog-manage-link";
import { ServiceTypeFormDialog } from "./service-type-form-dialog";

const ADD_NEW_VALUE = "__add_new_service__";

type ServiceTypeSelectProps = {
  services: ServiceTypeItem[];
  value: string;
  onChange: (id: string) => void;
  onServicesChange: (services: ServiceTypeItem[]) => void;
  canManage: boolean;
  loading?: boolean;
  label?: string;
  className?: string;
};

export function ServiceTypeSelect({
  services,
  value,
  onChange,
  onServicesChange,
  canManage,
  loading = false,
  label = "Service",
  className,
}: ServiceTypeSelectProps) {
  const [formOpen, setFormOpen] = React.useState(false);

  const activeServices = services.filter((s) => s.status === "active");

  React.useEffect(() => {
    if (!value) return;
    const selected = services.find((s) => s.id === value);
    if (selected && selected.status !== "active") {
      onChange(activeServices[0]?.id ?? "");
    }
  }, [activeServices, onChange, services, value]);

  function handleSaved(saved: ServiceTypeItem) {
    const without = services.filter((s) => s.id !== saved.id);
    const next = [...without, saved].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    );
    onServicesChange(next);
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

  if (!loading && activeServices.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <Label>{label}</Label>
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)]/20 px-4 py-5 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No services created yet</p>
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 rounded-full"
              onClick={() => setFormOpen(true)}
            >
              Create service
            </Button>
          ) : (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Ask a manager to add services before recording entries.
            </p>
          )}
        </div>
        {canManage ? (
          <ServiceTypeFormDialog
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
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
        disabled={loading}
      >
        {activeServices.length === 0 ? (
          <option value="">Loading services…</option>
        ) : (
          activeServices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))
        )}
        {canManage ? (
          <option value={ADD_NEW_VALUE} className="font-medium">
            + Add new service
          </option>
        ) : null}
      </select>

      {canManage ? (
        <>
          <CatalogManageLink
            href="/barbershop/settings/catalog?tab=services"
            label="Edit, disable, or remove services"
            className="mt-1 block"
          />
          <ServiceTypeFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            onSaved={handleSaved}
          />
        </>
      ) : null}
    </div>
  );
}
