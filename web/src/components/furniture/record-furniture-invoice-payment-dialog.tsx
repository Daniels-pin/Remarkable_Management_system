"use client";

import * as React from "react";
import { toast } from "sonner";

import { FurnitureOperationalAmountInput } from "@/components/furniture/furniture-operational-amount-input";
import {
  preventFurnitureFormEnterSubmit,
  preventFurnitureFormNativeSubmit,
} from "@/components/furniture/furniture-form-handlers";
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
import { ApiError, recordFurnitureInvoicePayment, type FurnitureInvoice } from "@/lib/api";
import { emitFurnitureUpdated } from "@/lib/furniture-events";
import { formatNaira } from "@/lib/format";

export function RecordFurnitureInvoicePaymentDialog({
  invoice,
  open,
  onOpenChange,
  onRecorded,
}: {
  invoice: FurnitureInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("Transfer");
  const [reference, setReference] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAmount("");
    setMethod("Transfer");
    setReference("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setSubmitting(false);
  }, [open]);

  const submit = async () => {
    if (!invoice) return;
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter a payment amount greater than zero.");
      return;
    }
    if (!method.trim()) {
      toast.error("Payment method is required.");
      return;
    }
    if (!paymentDate) {
      toast.error("Payment date is required.");
      return;
    }
    setSubmitting(true);
    try {
      await recordFurnitureInvoicePayment(invoice.id, {
        amount: value,
        method: method.trim(),
        reference: reference.trim() || null,
        payment_date: paymentDate,
        notes: notes.trim() || null,
      });
      toast.success("Payment recorded.");
      emitFurnitureUpdated();
      onOpenChange(false);
      onRecorded();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not record payment.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        {invoice ? (
          <form
            onSubmit={preventFurnitureFormNativeSubmit}
            onKeyDown={preventFurnitureFormEnterSubmit}
            className="space-y-4"
          >
            <DialogBody>
              <p className="text-sm text-[var(--muted-foreground)]">
                Balance due:{" "}
                <span className="font-medium text-rose-700">
                  {formatNaira(invoice.balance_due)}
                </span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="pay-amount">Amount</Label>
                <FurnitureOperationalAmountInput
                  id="pay-amount"
                  value={amount}
                  onValueChange={setAmount}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-method">Method</Label>
                <Input
                  id="pay-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  placeholder="Cash, Transfer, POS…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-reference">Reference</Label>
                <Input
                  id="pay-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-date">Payment Date</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-notes">Notes</Label>
                <textarea
                  id="pay-notes"
                  value={notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                  rows={2}
                  className="flex min-h-[60px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
                />
              </div>
            </DialogBody>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={submitting} onClick={() => void submit()}>
                {submitting ? "Saving…" : "Save Payment"}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
