"use client";

import * as React from "react";
import { toast } from "sonner";

import { PaymentMethodAdjustmentHistory } from "@/components/ops/payment-method-adjustment-history";
import {
  formatServicePaymentMethod,
  ServicePaymentMethodSelect,
  type ServicePaymentMethod,
} from "@/components/ops/service-payment-method-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ApiError, correctLedgerPaymentMethod, type PaymentMethodAdjustmentRow } from "@/lib/api";
import { cn } from "@/lib/utils";

export type PaymentMethodCorrectionTarget = {
  entryId: string;
  indexLabel: string;
  serviceName: string;
  amount: number;
  currentMethod: ServicePaymentMethod;
  adjustments?: PaymentMethodAdjustmentRow[];
};

export function PaymentMethodCorrectionDialog({
  target,
  open,
  onOpenChange,
  onCorrected,
}: {
  target: PaymentMethodCorrectionTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCorrected: () => void;
}) {
  const [newMethod, setNewMethod] = React.useState<ServicePaymentMethod>("cash");
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!target || !open) return;
    const fallback =
      target.currentMethod === "cash"
        ? "transfer"
        : target.currentMethod === "transfer"
          ? "pos"
          : "cash";
    setNewMethod(fallback);
    setReason("");
  }, [target, open]);

  const confirm = async () => {
    if (!target) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Reason is required.");
      return;
    }
    if (newMethod === target.currentMethod) {
      toast.error("Choose a different payment method.");
      return;
    }
    setSubmitting(true);
    try {
      await correctLedgerPaymentMethod(target.entryId, {
        new_payment_method: newMethod,
        reason: trimmed,
      });
      toast.success("Payment method corrected.");
      onOpenChange(false);
      onCorrected();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not correct payment method.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!target) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[var(--radius-xl)]">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-serif)] text-xl">
            Correct payment method
          </DialogTitle>
          <DialogDescription>
            {target.indexLabel} · {target.serviceName} — revenue and commission stay the same;
            only the payment channel allocation changes.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)]/70 bg-[var(--muted)]/15 px-3 py-3 text-sm">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                Current
              </p>
              <p className="mt-0.5 font-medium capitalize text-[var(--foreground)]">
                {formatServicePaymentMethod(target.currentMethod) ?? target.currentMethod}
              </p>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                New
              </Label>
              <ServicePaymentMethodSelect
                className="mt-1.5"
                value={newMethod}
                exclude={target.currentMethod}
                onChange={setNewMethod}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-correction-reason" className="text-xs">
              Reason
            </Label>
            <textarea
              id="payment-correction-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Wrong payment method selected during matching."
              rows={3}
              className={cn(
                "flex min-h-[5rem] w-full rounded-[var(--radius-md)] border border-[var(--border)]",
                "bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]",
                "placeholder:text-[var(--muted-foreground)] focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              )}
            />
          </div>

          {target.adjustments?.length ? (
            <PaymentMethodAdjustmentHistory adjustments={target.adjustments} />
          ) : null}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full bg-[var(--foreground)] text-[var(--background)]"
              disabled={submitting}
              onClick={() => void confirm()}
            >
              Confirm correction
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
