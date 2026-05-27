"use client";

import { Plus, Trash2 } from "lucide-react";
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
import { FurnitureOperationalAmountInput } from "@/components/furniture/furniture-operational-amount-input";
import { FurnitureOperationalNumericInput } from "@/components/furniture/furniture-operational-numeric-input";
import {
  preventFurnitureFormEnterSubmit,
  preventFurnitureFormNativeSubmit,
} from "@/components/furniture/furniture-form-handlers";
import { ApiError, createFurnitureOrder, type FurnitureOrderItemInput } from "@/lib/api";
import { emitFurnitureUpdated } from "@/lib/furniture-events";
import { formatNaira } from "@/lib/format";

type ItemRow = FurnitureOrderItemInput & { key: string };

function emptyItem(): ItemRow {
  return {
    key: crypto.randomUUID(),
    name: "",
    description: "",
    quantity: 0,
    unit_price: 0,
  };
}

function lineTotal(row: ItemRow) {
  const qty = Math.max(0, Number(row.quantity) || 0);
  const price = Math.max(0, Number(row.unit_price) || 0);
  return qty * price;
}

export function CreateFurnitureOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [customerName, setCustomerName] = React.useState("");
  const [customerAddress, setCustomerAddress] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [initialDeposit, setInitialDeposit] = React.useState("");
  const [items, setItems] = React.useState<ItemRow[]>([emptyItem()]);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCustomerName("");
    setCustomerAddress("");
    setCustomerPhone("");
    setDueDate("");
    setInitialDeposit("");
    setItems([emptyItem()]);
    setSubmitting(false);
  }, [open]);

  const subtotal = items.reduce((sum, row) => sum + lineTotal(row), 0);
  const grandTotal = subtotal;

  const updateItem = (key: string, patch: Partial<ItemRow>) => {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeItem = (key: string) => {
    setItems((rows) => {
      if (rows.length <= 1) return rows;
      return rows.filter((r) => r.key !== key);
    });
  };

  const addItem = () => setItems((rows) => [...rows, emptyItem()]);

  const submit = async () => {
    if (!customerName.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    if (!customerPhone.trim()) {
      toast.error("Phone number is required.");
      return;
    }
    if (!dueDate) {
      toast.error("Due date is required.");
      return;
    }

    const validItems = items.filter((row) => row.name.trim());
    if (validItems.length === 0) {
      toast.error("Add at least one order item.");
      return;
    }

    for (const row of validItems) {
      if (row.quantity <= 0) {
        toast.error("Quantity must be greater than zero.");
        return;
      }
      if (row.unit_price < 0) {
        toast.error("Unit price cannot be negative.");
        return;
      }
    }

    const deposit = initialDeposit.trim() ? Number(initialDeposit) : 0;
    if (deposit < 0) {
      toast.error("Initial deposit cannot be negative.");
      return;
    }

    setSubmitting(true);
    try {
      await createFurnitureOrder({
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim() || null,
        customer_phone: customerPhone.trim(),
        due_date: dueDate,
        initial_deposit: deposit,
        items: validItems.map(({ name, description, quantity, unit_price }) => ({
          name: name.trim(),
          description: description?.trim() || null,
          quantity,
          unit_price,
        })),
      });
      toast.success("Order created.");
      emitFurnitureUpdated();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not create order.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,42rem)] max-w-none">
        <DialogHeader>
          <DialogTitle>Create furniture order</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={preventFurnitureFormNativeSubmit}
          onKeyDown={preventFurnitureFormEnterSubmit}
        >
          <DialogBody className="max-h-[min(70dvh,36rem)] space-y-8 overflow-y-auto">
            <section className="space-y-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Customer information
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="customer-name">Customer name</Label>
                  <Input
                    id="customer-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="customer-address">Address</Label>
                  <Input
                    id="customer-address"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Delivery / billing address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-phone">Phone number</Label>
                  <Input
                    id="customer-phone"
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+234 …"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due-date">Due date</Label>
                  <Input
                    id="due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Order items
                </p>
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={addItem}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add item
                </Button>
              </div>
              <div className="space-y-3">
                {items.map((row, index) => (
                  <div
                    key={row.key}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--muted-foreground)]">
                        Item {index + 1}
                      </span>
                      {items.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[var(--muted-foreground)]"
                          onClick={() => removeItem(row.key)}
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Item name</Label>
                        <Input
                          value={row.name}
                          onChange={(e) => updateItem(row.key, { name: e.target.value })}
                          placeholder="e.g. Custom dining table"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Description</Label>
                        <Input
                          value={row.description ?? ""}
                          onChange={(e) => updateItem(row.key, { description: e.target.value })}
                          placeholder="Materials, dimensions, finish…"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <FurnitureOperationalNumericInput
                          min={0}
                          integerOnly
                          value={row.quantity}
                          defaultValue={0}
                          onValueChange={(quantity) => updateItem(row.key, { quantity })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit price</Label>
                        <FurnitureOperationalNumericInput
                          min={0}
                          value={row.unit_price}
                          defaultValue={0}
                          onValueChange={(unit_price) => updateItem(row.key, { unit_price })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Line total:{" "}
                          <span className="font-medium text-[var(--foreground)]">
                            {formatNaira(lineTotal(row))}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Order totals
              </p>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted-foreground)]">Subtotal</span>
                  <span className="font-medium">{formatNaira(subtotal)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-3">
                  <span className="font-medium">Grand total</span>
                  <span className="font-[family-name:var(--font-serif)] text-xl font-semibold">
                    {formatNaira(grandTotal)}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="initial-deposit">Initial deposit (optional)</Label>
                <FurnitureOperationalAmountInput
                  id="initial-deposit"
                  value={initialDeposit}
                  onValueChange={setInitialDeposit}
                  placeholder="0"
                />
              </div>
            </section>
          </DialogBody>
          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] p-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting}
              className="rounded-full"
              onClick={() => void submit()}
            >
              {submitting ? "Creating…" : "Create order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
