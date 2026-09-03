"use client";

import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { FurnitureOperationalAmountInput } from "@/components/furniture/furniture-operational-amount-input";
import { FurnitureOperationalNumericInput } from "@/components/furniture/furniture-operational-numeric-input";
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
  createFurnitureInvoice,
  updateFurnitureInvoice,
  updateFurnitureInvoiceNotes,
  type FurnitureInvoice,
  type FurnitureOrderItemInput,
} from "@/lib/api";
import { emitFurnitureUpdated } from "@/lib/furniture-events";
import { formatNaira } from "@/lib/format";

type ItemRow = FurnitureOrderItemInput & { key: string };

function emptyItem(): ItemRow {
  return { key: crypto.randomUUID(), name: "", description: "", quantity: 0, unit_price: 0 };
}

function lineTotal(row: ItemRow) {
  return Math.max(0, Number(row.quantity) || 0) * Math.max(0, Number(row.unit_price) || 0);
}

export function CreateFurnitureInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: FurnitureInvoice | null;
  onSaved: () => void;
}) {
  const isEdit = Boolean(invoice);
  const financialLocked =
    invoice?.status === "paid" || invoice?.status === "completed" || invoice?.status === "voided";
  const notesOnly =
    invoice?.status === "paid" || invoice?.status === "completed";

  const [customerName, setCustomerName] = React.useState("");
  const [customerAddress, setCustomerAddress] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerEmail, setCustomerEmail] = React.useState("");
  const [salesRep, setSalesRep] = React.useState("");
  const [dateIssued, setDateIssued] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [paymentTerms, setPaymentTerms] = React.useState("");
  const [internalNotes, setInternalNotes] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [additionalCharges, setAdditionalCharges] = React.useState("");
  const [tax, setTax] = React.useState("");
  const [advancePayment, setAdvancePayment] = React.useState("");
  const [advanceMethod, setAdvanceMethod] = React.useState("Transfer");
  const [items, setItems] = React.useState<ItemRow[]>([emptyItem()]);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (invoice) {
      setCustomerName(invoice.customer_name);
      setCustomerAddress(invoice.customer_address ?? "");
      setCustomerPhone(invoice.customer_phone);
      setCustomerEmail(invoice.customer_email ?? "");
      setSalesRep(invoice.sales_representative ?? "");
      setDateIssued(invoice.date_issued);
      setDueDate(invoice.due_date);
      setPaymentTerms(invoice.payment_terms ?? "");
      setInternalNotes(invoice.internal_notes ?? "");
      setDiscount(String(invoice.discount || ""));
      setAdditionalCharges(String(invoice.additional_charges || ""));
      setTax(String(invoice.tax || ""));
      setAdvancePayment("");
      setItems(
        invoice.items.length
          ? invoice.items.map((i) => ({
              key: i.id,
              name: i.name,
              description: i.description ?? "",
              quantity: i.quantity,
              unit_price: i.unit_price,
            }))
          : [emptyItem()],
      );
    } else {
      setCustomerName("");
      setCustomerAddress("");
      setCustomerPhone("");
      setCustomerEmail("");
      setSalesRep("");
      setDateIssued(new Date().toISOString().slice(0, 10));
      setDueDate("");
      setPaymentTerms("");
      setInternalNotes("");
      setDiscount("");
      setAdditionalCharges("");
      setTax("");
      setAdvancePayment("");
      setAdvanceMethod("Transfer");
      setItems([emptyItem()]);
    }
    setSubmitting(false);
  }, [open, invoice]);

  const subtotal = items.reduce((sum, row) => sum + lineTotal(row), 0);
  const discountVal = Number(discount) || 0;
  const chargesVal = Number(additionalCharges) || 0;
  const taxVal = tax.trim() ? Number(tax) : 0;
  const grandTotal = Math.max(0, subtotal - discountVal + chargesVal + taxVal);

  const updateItem = (key: string, patch: Partial<ItemRow>) => {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const submit = async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error("Customer name and phone are required.");
      return;
    }
    if (!dateIssued || !dueDate) {
      toast.error("Issue date and due date are required.");
      return;
    }

    if (notesOnly && invoice) {
      setSubmitting(true);
      try {
        await updateFurnitureInvoiceNotes(invoice.id, {
          internal_notes: internalNotes.trim() || null,
          payment_terms: paymentTerms.trim() || null,
        });
        toast.success("Notes updated.");
        emitFurnitureUpdated();
        onOpenChange(false);
        onSaved();
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Could not save invoice.";
        toast.error(msg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const validItems = items.filter((row) => row.name.trim());
    if (validItems.length === 0) {
      toast.error("Add at least one item.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim() || null,
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || null,
        sales_representative: salesRep.trim() || null,
        date_issued: dateIssued,
        due_date: dueDate,
        payment_terms: paymentTerms.trim() || null,
        internal_notes: internalNotes.trim() || null,
        items: validItems.map(({ name, description, quantity, unit_price }) => ({
          name: name.trim(),
          description: description?.trim() || null,
          quantity,
          unit_price,
        })),
        discount: discountVal,
        additional_charges: chargesVal,
        tax: tax.trim() ? taxVal : null,
      };

      if (isEdit && invoice) {
        await updateFurnitureInvoice(invoice.id, payload);
        toast.success("Invoice updated.");
      } else {
        const advance = Number(advancePayment) || 0;
        await createFurnitureInvoice({
          ...payload,
          advance_payment: advance,
          advance_payment_method: advance > 0 ? advanceMethod : null,
          advance_payment_date: advance > 0 ? dateIssued : null,
        });
        toast.success("Invoice created.");
      }
      emitFurnitureUpdated();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not save invoice.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Invoice" : "Create Invoice"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={preventFurnitureFormNativeSubmit}
          onKeyDown={preventFurnitureFormEnterSubmit}
          className="space-y-6"
        >
          <DialogBody className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Customer</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  disabled={financialLocked || notesOnly}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Billing Address</Label>
                <textarea
                  value={customerAddress}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setCustomerAddress(e.target.value)
                  }
                  rows={2}
                  disabled={financialLocked || notesOnly}
                  className="flex min-h-[60px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  disabled={financialLocked || notesOnly}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  disabled={financialLocked || notesOnly}
                />
              </div>
              <div className="space-y-2">
                <Label>Sales Representative</Label>
                <Input
                  value={salesRep}
                  onChange={(e) => setSalesRep(e.target.value)}
                  disabled={financialLocked || notesOnly}
                />
              </div>
              <div className="space-y-2">
                <Label>Issue Date</Label>
                <Input
                  type="date"
                  value={dateIssued}
                  onChange={(e) => setDateIssued(e.target.value)}
                  disabled={financialLocked || notesOnly}
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={financialLocked || notesOnly}
                />
              </div>
            </div>

            {!notesOnly ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Items</Label>
                  {!financialLocked ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setItems((r) => [...r, emptyItem()])}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Item
                    </Button>
                  ) : null}
                </div>
                {items.map((row) => (
                  <div key={row.key} className="grid gap-2 rounded-[var(--radius-lg)] border p-3 sm:grid-cols-12">
                    <Input
                      className="sm:col-span-3"
                      placeholder="Item"
                      value={row.name}
                      onChange={(e) => updateItem(row.key, { name: e.target.value })}
                      disabled={financialLocked}
                    />
                    <Input
                      className="sm:col-span-3"
                      placeholder="Description"
                      value={row.description ?? ""}
                      onChange={(e) => updateItem(row.key, { description: e.target.value })}
                      disabled={financialLocked}
                    />
                    <FurnitureOperationalNumericInput
                      className="sm:col-span-2"
                      value={row.quantity}
                      defaultValue={0}
                      onValueChange={(v) => updateItem(row.key, { quantity: v })}
                      disabled={financialLocked}
                      integerOnly
                      min={0}
                    />
                    <FurnitureOperationalAmountInput
                      className="sm:col-span-2"
                      value={String(row.unit_price)}
                      onValueChange={(v) => updateItem(row.key, { unit_price: Number(v) || 0 })}
                      disabled={financialLocked}
                    />
                    <div className="flex items-center justify-between sm:col-span-2">
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {formatNaira(lineTotal(row))}
                      </span>
                      {!financialLocked && items.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setItems((rows) => rows.filter((r) => r.key !== row.key))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {!notesOnly && !financialLocked ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Discount</Label>
                  <FurnitureOperationalAmountInput value={discount} onValueChange={setDiscount} />
                </div>
                <div className="space-y-2">
                  <Label>Additional Charges</Label>
                  <FurnitureOperationalAmountInput
                    value={additionalCharges}
                    onValueChange={setAdditionalCharges}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tax (optional)</Label>
                  <FurnitureOperationalAmountInput value={tax} onValueChange={setTax} />
                </div>
              </div>
            ) : null}

            {!isEdit ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Advance Payment (optional)</Label>
                  <FurnitureOperationalAmountInput
                    value={advancePayment}
                    onValueChange={setAdvancePayment}
                  />
                </div>
                {Number(advancePayment) > 0 ? (
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Input value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value)} />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <textarea
                value={paymentTerms}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setPaymentTerms(e.target.value)
                }
                rows={2}
                disabled={invoice?.status === "voided"}
                className="flex min-h-[60px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <textarea
                value={internalNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setInternalNotes(e.target.value)
                }
                rows={2}
                disabled={invoice?.status === "voided"}
                className="flex min-h-[60px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
              />
            </div>

            {!notesOnly ? (
              <div className="rounded-[var(--radius-lg)] border bg-[var(--muted)]/30 p-4 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatNaira(subtotal)}</span>
                </div>
                <div className="mt-1 flex justify-between font-semibold">
                  <span>Grand Total</span>
                  <span>{formatNaira(grandTotal)}</span>
                </div>
                {!isEdit && Number(advancePayment) > 0 ? (
                  <div className="mt-1 flex justify-between text-emerald-700">
                    <span>Balance Due</span>
                    <span>{formatNaira(grandTotal - Number(advancePayment))}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </DialogBody>

          {invoice?.status !== "voided" ? (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={submitting} onClick={() => void submit()}>
                {submitting ? "Saving…" : isEdit ? "Save Changes" : "Create Invoice"}
              </Button>
            </div>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
