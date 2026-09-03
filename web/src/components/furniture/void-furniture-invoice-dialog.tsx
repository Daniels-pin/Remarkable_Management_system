"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  preventFurnitureFormEnterSubmit,
  preventFurnitureFormNativeSubmit,
} from "@/components/furniture/furniture-form-handlers";
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
import { ApiError, voidFurnitureInvoice, type FurnitureInvoice } from "@/lib/api";
import { emitFurnitureUpdated } from "@/lib/furniture-events";

export function VoidFurnitureInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  onVoided,
}: {
  invoice: FurnitureInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoided: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setReason("");
    setSubmitting(false);
  }, [open]);

  const submit = async () => {
    if (!invoice) return;
    if (!reason.trim()) {
      toast.error("A reason is required to void this invoice.");
      return;
    }
    setSubmitting(true);
    try {
      await voidFurnitureInvoice(invoice.id, reason.trim());
      toast.success("Invoice voided.");
      emitFurnitureUpdated();
      onOpenChange(false);
      onVoided();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not void invoice.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void Invoice</DialogTitle>
          <DialogDescription>
            This invoice will be marked as Voided. Financial history will remain intact. This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {invoice ? (
          <form
            onSubmit={preventFurnitureFormNativeSubmit}
            onKeyDown={preventFurnitureFormEnterSubmit}
            className="space-y-4"
          >
            <DialogBody>
              <div className="space-y-2">
                <Label htmlFor="void-reason">Reason (required)</Label>
                <textarea
                  id="void-reason"
                  value={reason}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why this invoice is being voided…"
                  className="flex min-h-[80px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
                />
              </div>
            </DialogBody>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={submitting}
                onClick={() => void submit()}
              >
                {submitting ? "Voiding…" : "Void Invoice"}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
