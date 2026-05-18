"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ApiError,
  listServiceTypes,
  type ServiceTypeItem,
  updateServiceType,
} from "@/lib/api";

import {
  CatalogManagementList,
  type CatalogManageItem,
} from "./catalog-management-list";
import { ServiceTypeFormDialog } from "./service-type-form-dialog";

export function ServicesManagementPanel() {
  const [loading, setLoading] = React.useState(true);
  const [services, setServices] = React.useState<ServiceTypeItem[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ServiceTypeItem | null>(null);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listServiceTypes({ includeInactive: true });
      setServices(res.items);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load services.");
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(service: ServiceTypeItem) {
    setEditing(service);
    setFormOpen(true);
  }

  function handleSaved(saved: ServiceTypeItem) {
    setServices((prev) => {
      const without = prev.filter((s) => s.id !== saved.id);
      return [...without, saved].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
    });
  }

  async function patchStatus(
    service: CatalogManageItem,
    status: ServiceTypeItem["status"],
    successMessage: string,
  ) {
    if (service.status === status) return;
    setUpdatingId(service.id);
    try {
      const saved = await updateServiceType(service.id, { status });
      handleSaved(saved);
      toast.success(successMessage);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not update service.");
    } finally {
      setUpdatingId(null);
    }
  }

  const listItems: CatalogManageItem[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    created_at: s.created_at,
  }));

  const activeCount = services.filter((s) => s.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-[var(--muted-foreground)]">
          {activeCount} active · {services.length} total
        </p>
        <Button
          type="button"
          className="rounded-full bg-[var(--foreground)] text-[var(--background)]"
          onClick={openCreate}
        >
          <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
          New service
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading services…</p>
      ) : services.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-6 py-12 text-center">
          <p className="text-sm font-medium">No services created yet</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Add your first service to enable Daily Ledger entries.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-full"
            onClick={openCreate}
          >
            Create service
          </Button>
        </div>
      ) : (
        <CatalogManagementList
          items={listItems}
          entityLabel="service"
          updatingId={updatingId}
          onEdit={(item) => {
            const row = services.find((s) => s.id === item.id);
            if (row) openEdit(row);
          }}
          onDisable={(item) =>
            void patchStatus(item, "disabled", "Service disabled")
          }
          onReactivate={(item) =>
            void patchStatus(item, "active", "Service reactivated")
          }
          onDelete={(item) =>
            void patchStatus(item, "archived", "Service removed — history preserved")
          }
        />
      )}

      <ServiceTypeFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        service={editing}
        onSaved={handleSaved}
      />
    </div>
  );
}
