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
  createServiceType,
  type ServiceTypeItem,
  type ServiceTypeStatus,
  updateServiceType,
} from "@/lib/api";

type ServiceTypeFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: ServiceTypeItem | null;
  onSaved: (service: ServiceTypeItem) => void;
};

const statusOptions: { value: ServiceTypeStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
  { value: "archived", label: "Archived" },
];

export function ServiceTypeFormDialog({
  open,
  onOpenChange,
  service,
  onSaved,
}: ServiceTypeFormDialogProps) {
  const isEdit = Boolean(service);
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<ServiceTypeStatus>("active");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(service?.name ?? "");
    setStatus(service?.status ?? "active");
  }, [open, service]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a service name.");
      return;
    }

    setSaving(true);
    try {
      const saved = isEdit && service
        ? await updateServiceType(service.id, { name: trimmed, status })
        : await createServiceType({ name: trimmed, status });
      toast.success(isEdit ? "Service updated" : "Service created", {
        description: trimmed,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error(isEdit ? "Could not update service." : "Could not create service.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,24rem)]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit service" : "New service"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form onSubmit={(e) => void submit(e)} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="svc-name">Service name</Label>
              <Input
                id="svc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Haircut"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="svc-status">Status</Label>
              <select
                id="svc-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ServiceTypeStatus)}
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create service"}
            </Button>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
