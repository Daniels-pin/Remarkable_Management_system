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
import { ApiError, recordFurnitureOrderDeposit, type FurnitureOrder } from "@/lib/api";
import { emitFurnitureUpdated } from "@/lib/furniture-events";
import { formatNaira } from "@/lib/format";

export function RecordFurnitureDepositDialog({
  order,
  open,
  onOpenChange,
  onRecorded,
}: {
  order: FurnitureOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAmount("");
    setNote("");
    setSubmitting(false);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter a deposit amount greater than zero.");
      return;
    }
    setSubmitting(true);
    try {
      await recordFurnitureOrderDeposit(order.id, {
        amount: value,
        note: note.trim() || null,
      });
      toast.success("Deposit recorded.");
      emitFurnitureUpdated();
      onOpenChange(false);
      onRecorded();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not record deposit.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record deposit</DialogTitle>
        </DialogHeader>
        {order ? (
          <form onSubmit={(e) => void submit(e)}>
            <DialogBody className="space-y-4">
              <p className="text-sm text-[var(--muted-foreground)]">
                Order {order.order_number} · Outstanding{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {formatNaira(order.outstanding_balance)}
                </span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="deposit-amount">Amount</Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  min={0}
                  step={100}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deposit-note">Note (optional)</Label>
                <Input
                  id="deposit-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Payment reference, method…"
                />
              </div>
            </DialogBody>
            <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] p-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="rounded-full">
                {submitting ? "Saving…" : "Record deposit"}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
