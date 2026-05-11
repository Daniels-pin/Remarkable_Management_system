"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  createBarbershopLedgerEntry,
  listDirectoryBarbers,
  listExpenseCategories,
  listSaleCategories,
  listServiceTypes,
} from "@/lib/api";
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

type EntryKind = "service" | "sale" | "expense";

const paymentMethods = ["cash", "transfer", "pos"] as const;

export function AddEntryFab({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<EntryKind>("service");

  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [serviceTypes, setServiceTypes] = React.useState<{ id: string; name: string }[]>([]);
  const [saleCategories, setSaleCategories] = React.useState<{ id: string; name: string }[]>([]);
  const [expenseCategories, setExpenseCategories] = React.useState<{ id: string; name: string }[]>(
    [],
  );
  const [barbers, setBarbers] = React.useState<{ id: string; name: string }[]>([]);

  const [serviceTypeId, setServiceTypeId] = React.useState("");
  const [employeeId, setEmployeeId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<(typeof paymentMethods)[number]>("cash");
  const [note, setNote] = React.useState("");

  const [saleCategoryId, setSaleCategoryId] = React.useState("");
  const [expenseCategoryId, setExpenseCategoryId] = React.useState("");

  const hydrate = React.useCallback(async () => {
    setCatalogLoading(true);
    try {
      const [svc, sales, exp, roster] = await Promise.all([
        listServiceTypes(),
        listSaleCategories(),
        listExpenseCategories(),
        listDirectoryBarbers(),
      ]);

      const svcItems = svc.items.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name }));
      const saleItems = sales.items
        .filter((s) => s.is_active)
        .map((s) => ({ id: s.id, name: s.name }));
      const expItems = exp.items
        .filter((s) => s.is_active)
        .map((s) => ({ id: s.id, name: s.name }));
      const barberItems = roster.items.map((b) => ({
        id: b.id,
        name: b.full_name?.trim() || `@${b.username}`,
      }));

      setServiceTypes(svcItems);
      setSaleCategories(saleItems);
      setExpenseCategories(expItems);
      setBarbers(barberItems);

      setServiceTypeId((prev) => prev || svcItems[0]?.id || "");
      setSaleCategoryId((prev) => prev || saleItems[0]?.id || "");
      setExpenseCategoryId((prev) => prev || expItems[0]?.id || "");
      setEmployeeId((prev) => prev || barberItems[0]?.id || "");
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load entry forms.");
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
    setKind("service");
    setServiceTypeId(serviceTypes[0]?.id ?? "");
    setEmployeeId(barbers[0]?.id ?? "");
    setPaymentMethod("cash");
    setSaleCategoryId(saleCategories[0]?.id ?? "");
    setExpenseCategoryId(expenseCategories[0]?.id ?? "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    if (kind === "service") {
      if (!serviceTypeId) {
        toast.error("Pick a service type.");
        return;
      }
      if (!employeeId) {
        toast.error("Pick a barber for this service line.");
        return;
      }
    }
    if (kind === "sale" && !saleCategoryId) {
      toast.error("Pick a sale category.");
      return;
    }
    if (kind === "expense" && !expenseCategoryId) {
      toast.error("Pick an expense category.");
      return;
    }

    setSaving(true);
    try {
      const occurred_at = new Date().toISOString();
      const base = {
        entry_type: kind,
        occurred_at,
        amount: n,
        payment_method: paymentMethod,
        note: note.trim() || null,
      };

      if (kind === "service") {
        await createBarbershopLedgerEntry({
          ...base,
          service_type_id: serviceTypeId,
          employee_user_id: employeeId,
        });
      } else if (kind === "sale") {
        await createBarbershopLedgerEntry({
          ...base,
          sale_category_id: saleCategoryId,
        });
      } else {
        await createBarbershopLedgerEntry({
          ...base,
          expense_category_id: expenseCategoryId,
        });
      }

      toast.success("Entry recorded", {
        description: `${kind.charAt(0).toUpperCase() + kind.slice(1)} · ${n.toLocaleString("en-NG")}`,
      });
      setOpen(false);
      reset();
      onCreated?.();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not record entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        aria-label="Add entry"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full border border-[var(--border)] bg-[var(--foreground)] text-[var(--background)] shadow-[var(--shadow-elevated)]",
          "hover:opacity-95 active:scale-[0.98]",
        )}
      >
        <Plus className="h-6 w-6" strokeWidth={1.75} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(100%,26rem)]">
          <DialogHeader>
            <DialogTitle>Add ledger entry</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form onSubmit={(e) => void submit(e)} className="space-y-5">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["service", "Service"],
                    ["sale", "Sale"],
                    ["expense", "Expense"],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={kind === id ? "default" : "outline"}
                    className={
                      kind === id
                        ? "rounded-full border-transparent bg-[var(--foreground)] text-[var(--background)]"
                        : "rounded-full border-dashed"
                    }
                    onClick={() => setKind(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {kind === "service" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Service type</Label>
                    <select
                      value={serviceTypeId}
                      onChange={(e) => setServiceTypeId(e.target.value)}
                      className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                      disabled={catalogLoading}
                    >
                      {serviceTypes.length === 0 ? (
                        <option value="">No service types yet</option>
                      ) : (
                        serviceTypes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Barber</Label>
                    <select
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                      disabled={catalogLoading}
                    >
                      {barbers.length === 0 ? (
                        <option value="">No barbers in directory yet</option>
                      ) : (
                        barbers.map((em) => (
                          <option key={em.id} value={em.id}>
                            {em.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </>
              ) : null}

              {kind === "sale" ? (
                <div className="space-y-1.5">
                  <Label>Sale category</Label>
                  <select
                    value={saleCategoryId}
                    onChange={(e) => setSaleCategoryId(e.target.value)}
                    className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                    disabled={catalogLoading}
                  >
                    {saleCategories.length === 0 ? (
                      <option value="">No sale categories yet</option>
                    ) : (
                      saleCategories.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : null}

              {kind === "expense" ? (
                <div className="space-y-1.5">
                  <Label>Expense category</Label>
                  <select
                    value={expenseCategoryId}
                    onChange={(e) => setExpenseCategoryId(e.target.value)}
                    className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                    disabled={catalogLoading}
                  >
                    {expenseCategories.length === 0 ? (
                      <option value="">No expense categories yet</option>
                    ) : (
                      expenseCategories.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="amt">Amount (₦)</Label>
                <Input
                  id="amt"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as (typeof paymentMethods)[number])
                  }
                  className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm capitalize"
                >
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="note">Note</Label>
                <Input
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional context"
                />
              </div>

              <Button type="submit" className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]">
                {saving ? "Saving…" : "Save entry"}
              </Button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
