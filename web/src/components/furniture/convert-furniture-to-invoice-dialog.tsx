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
import {
  ApiError,
  convertFurnitureOrderToInvoice,
  convertFurnitureQuotationToInvoice,
  type FurnitureInvoicePaymentScenario,
  type FurnitureOrder,
  type FurnitureQuotation,
} from "@/lib/api";
import { emitFurnitureUpdated } from "@/lib/furniture-events";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

type Source =
  | { type: "quotation"; data: FurnitureQuotation }
  | { type: "order"; data: FurnitureOrder }
  | null;

const SCENARIOS: { value: FurnitureInvoicePaymentScenario; label: string }[] = [
  { value: "no_payment", label: "No Payment" },
  { value: "advance_payment", label: "Advance Payment" },
  { value: "paid_in_full", label: "Paid in Full" },
];

export function ConvertFurnitureToInvoiceDialog({
  source,
  open,
  onOpenChange,
  onConverted,
}: {
  source: Source;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted?: (invoiceId: string) => void;
}) {
  const [scenario, setScenario] = React.useState<FurnitureInvoicePaymentScenario>("no_payment");
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("Transfer");
  const [paymentDate, setPaymentDate] = React.useState("");
  const [paymentReference, setPaymentReference] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const grandTotal = source
    ? source.type === "quotation"
      ? source.data.grand_total
      : source.data.grand_total
    : 0;

  React.useEffect(() => {
    if (!open) return;
    setScenario("no_payment");
    setPaymentAmount("");
    setPaymentMethod("Transfer");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentReference("");
    setSubmitting(false);
  }, [open, source]);

  const submit = async () => {
    if (!source) return;

    if (scenario === "advance_payment") {
      const amount = Number(paymentAmount);
      if (!amount || amount <= 0) {
        toast.error("Enter a valid advance payment amount.");
        return;
      }
      if (amount >= grandTotal) {
        toast.error("Advance payment must be less than the grand total.");
        return;
      }
      if (!paymentMethod.trim()) {
        toast.error("Payment method is required.");
        return;
      }
    }

    const body = {
      payment_scenario: scenario,
      payment_amount:
        scenario === "advance_payment" ? Number(paymentAmount) : scenario === "paid_in_full" ? grandTotal : null,
      payment_method: scenario === "no_payment" ? null : paymentMethod.trim() || "Cash",
      payment_date: paymentDate || new Date().toISOString().slice(0, 10),
      payment_reference: paymentReference.trim() || null,
    };

    setSubmitting(true);
    try {
      const invoice =
        source.type === "quotation"
          ? await convertFurnitureQuotationToInvoice(source.data.id, body)
          : await convertFurnitureOrderToInvoice(source.data.id, body);
      emitFurnitureUpdated();
      toast.success(`Invoice ${invoice.invoice_number} created.`);
      onOpenChange(false);
      onConverted?.(invoice.id);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not create invoice.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    source?.type === "quotation"
      ? `Convert ${source.data.quotation_number} to Invoice`
      : source?.type === "order"
        ? `Convert ${source.data.order_number} to Invoice`
        : "Convert to Invoice";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {source ? (
          <form
            onSubmit={preventFurnitureFormNativeSubmit}
            onKeyDown={preventFurnitureFormEnterSubmit}
            className="space-y-5"
          >
            <DialogBody>
              <p className="text-sm text-[var(--muted-foreground)]">
                Has the customer made any payment?
              </p>
              <p className="text-sm font-medium">Grand Total: {formatNaira(grandTotal)}</p>

              <div className="grid gap-2">
                {SCENARIOS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScenario(opt.value)}
                    className={cn(
                      "rounded-[var(--radius-lg)] border px-4 py-3 text-left text-sm transition-colors",
                      scenario === opt.value
                        ? "border-[var(--foreground)]/30 bg-[var(--foreground)]/5"
                        : "border-[var(--border)] hover:border-[var(--foreground)]/15",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {scenario === "advance_payment" ? (
                <div className="space-y-4 border-t border-[var(--border)] pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="payment-amount">Payment Amount</Label>
                    <FurnitureOperationalAmountInput
                      id="payment-amount"
                      value={paymentAmount}
                      onValueChange={setPaymentAmount}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-method">Payment Method</Label>
                    <Input
                      id="payment-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      placeholder="Cash, Transfer, POS…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-date">Payment Date</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-reference">Reference</Label>
                    <Input
                      id="payment-reference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  {paymentAmount ? (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Remaining balance:{" "}
                      <span className="font-medium text-rose-700">
                        {formatNaira(grandTotal - Number(paymentAmount))}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {scenario === "paid_in_full" ? (
                <div className="space-y-4 border-t border-[var(--border)] pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="full-payment-method">Payment Method</Label>
                    <Input
                      id="full-payment-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="full-payment-date">Payment Date</Label>
                    <Input
                      id="full-payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="full-payment-reference">Reference</Label>
                    <Input
                      id="full-payment-reference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </DialogBody>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={submitting} onClick={() => void submit()}>
                {submitting ? "Creating…" : "Create Invoice"}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
