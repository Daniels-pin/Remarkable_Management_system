"use client";

import * as React from "react";
import { Plus, Scissors } from "lucide-react";
import { toast } from "sonner";

import { ServiceTypeSelect } from "@/components/ops/service-type-select";
import {
  ApiError,
  createBarberServiceEntry,
  listServiceTypes,
  type ServiceTypeItem,
} from "@/lib/api";
import { dispatchReconciliationUpdated } from "@/lib/reconciliation-events";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type RecordServiceFabProps = {
  onCreated?: () => void;
  variant?: "fab" | "inline";
  className?: string;
};

export function RecordServiceFab({
  onCreated,
  variant = "fab",
  className,
}: RecordServiceFabProps) {
  const [open, setOpen] = React.useState(false);
  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [serviceTypes, setServiceTypes] = React.useState<ServiceTypeItem[]>([]);
  const [serviceTypeId, setServiceTypeId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");

  const hydrate = React.useCallback(async () => {
    setCatalogLoading(true);
    try {
      const svc = await listServiceTypes();
      const items = svc.items;
      setServiceTypes(items);
      const firstActive = items.find((s) => s.status === "active");
      setServiceTypeId((prev) => prev || firstActive?.id || "");
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load service types.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      void hydrate();
    });
  }, [open, hydrate]);

  function reset() {
    setAmount("");
    setNote("");
    setServiceTypeId(serviceTypes.find((s) => s.status === "active")?.id ?? "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!serviceTypeId) {
      toast.error("Pick a service type.");
      return;
    }

    setSaving(true);
    try {
      await createBarberServiceEntry({
        occurred_at: new Date().toISOString(),
        service_type_id: serviceTypeId,
        amount: n,
        note: note.trim() || null,
      });
      toast.success("Service recorded", {
        description: `Pending review · ₦${n.toLocaleString("en-NG")}`,
      });
      setOpen(false);
      reset();
      onCreated?.();
      dispatchReconciliationUpdated();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not record service.");
    } finally {
      setSaving(false);
    }
  }

  const trigger =
    variant === "fab" ? (
      <Button
        type="button"
        size="icon-lg"
        aria-label="Record service"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))] z-40 h-14 w-14 rounded-full border border-[var(--border)] bg-[var(--foreground)] text-[var(--background)] shadow-[var(--shadow-elevated)]",
          "hover:opacity-95 active:scale-[0.98]",
          className,
        )}
      >
        <Plus className="h-6 w-6" strokeWidth={1.75} />
      </Button>
    ) : (
      <Button
        type="button"
        className={cn(
          "rounded-full bg-[var(--foreground)] px-6 text-[var(--background)]",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <Scissors className="mr-2 h-4 w-4" strokeWidth={1.75} />
        Record service
      </Button>
    );

  return (
    <>
      {trigger}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(100%,26rem)]">
          <DialogHeader>
            <DialogTitle>Record service</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form onSubmit={(e) => void submit(e)} className="space-y-5">
              <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
                Logged under your profile with the next index number. Payment handling is recorded
                during manager reconciliation.
              </p>

              <ServiceTypeSelect
                services={serviceTypes}
                value={serviceTypeId}
                onChange={setServiceTypeId}
                onServicesChange={setServiceTypes}
                canManage={false}
                loading={catalogLoading}
                label="Service"
              />

              <div className="space-y-1.5">
                <Label htmlFor="svc-amt">Amount (₦)</Label>
                <Input
                  id="svc-amt"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="svc-note">Note</Label>
                <Input
                  id="svc-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional context"
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]"
                disabled={saving || catalogLoading}
              >
                {saving ? "Saving…" : "Record service"}
              </Button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
