"use client";

import * as React from "react";
import { Plus, Scissors, Tag, Wallet } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/auth-provider";
import { CategorySelect } from "@/components/ops/category-select";
import { ServiceTypeSelect } from "@/components/ops/service-type-select";
import {
  ApiError,
  createBarbershopLedgerEntry,
  listDirectoryBarbers,
  listExpenseCategories,
  listSaleCategories,
  listServiceTypes,
  type CategoryItem,
  type ServiceTypeItem,
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
import {
  EXPENSE_PAYMENT_SOURCES,
  type ExpensePaymentSource,
} from "@/lib/expense-payment";
import { cn } from "@/lib/utils";

export type EntryKind = "service" | "sale" | "expense";

const revenuePaymentMethods = ["cash", "transfer", "pos"] as const;

const ENTRY_META: Record<
  EntryKind,
  { label: string; dialogTitle: string; submitLabel: string; Icon: typeof Scissors }
> = {
  service: { label: "Record service", dialogTitle: "Record service", submitLabel: "Record service", Icon: Scissors },
  sale: { label: "Record sale", dialogTitle: "Record sale", submitLabel: "Record sale", Icon: Tag },
  expense: {
    label: "Record expense",
    dialogTitle: "Record expense",
    submitLabel: "Record expense",
    Icon: Wallet,
  },
};

export type AddEntryFabProps = {
  onCreated?: () => void;
  /** When set, locks the form to one entry type and hides the kind switcher. */
  entryType?: EntryKind;
  variant?: "fab" | "inline";
  label?: string;
  className?: string;
};

export function AddEntryFab({
  onCreated,
  entryType,
  variant = "fab",
  label,
  className,
}: AddEntryFabProps) {
  const { session } = useAuth();
  const canManageCatalog =
    session?.role === "admin" || session?.role === "manager";
  const locked = entryType != null;
  const meta = ENTRY_META[entryType ?? "service"];

  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<EntryKind>(entryType ?? "service");

  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [serviceTypes, setServiceTypes] = React.useState<ServiceTypeItem[]>([]);
  const [saleCategories, setSaleCategories] = React.useState<CategoryItem[]>([]);
  const [expenseCategories, setExpenseCategories] = React.useState<CategoryItem[]>([]);
  const [barbers, setBarbers] = React.useState<{ id: string; name: string }[]>([]);

  const [serviceTypeId, setServiceTypeId] = React.useState("");
  const [employeeId, setEmployeeId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] =
    React.useState<(typeof revenuePaymentMethods)[number]>("cash");
  const [expensePaymentSource, setExpensePaymentSource] =
    React.useState<ExpensePaymentSource>("cash_shop");
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

      const svcItems = svc.items;
      const saleItems = sales.items;
      const expItems = exp.items;
      const barberItems = roster.items.map((b) => ({
        id: b.id,
        name: b.full_name?.trim() || `@${b.username}`,
      }));

      setServiceTypes(svcItems);
      setSaleCategories(saleItems);
      setExpenseCategories(expItems);
      setBarbers(barberItems);

      const firstActive = svcItems.find((s) => s.status === "active");
      const firstSale = saleItems.find((s) => s.status === "active");
      const firstExpense = expItems.find((s) => s.status === "active");
      setServiceTypeId((prev) => prev || firstActive?.id || "");
      setSaleCategoryId((prev) => prev || firstSale?.id || "");
      setExpenseCategoryId((prev) => prev || firstExpense?.id || "");
      setEmployeeId((prev) => prev || barberItems[0]?.id || "");
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load entry forms.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (entryType) setKind(entryType);
  }, [entryType]);

  React.useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      void hydrate();
    });
  }, [open, hydrate]);

  function reset() {
    setAmount("");
    setNote("");
    setKind(entryType ?? "service");
    setServiceTypeId(serviceTypes.find((s) => s.status === "active")?.id ?? "");
    setEmployeeId(barbers[0]?.id ?? "");
    setPaymentMethod("cash");
    setExpensePaymentSource("cash_shop");
    setSaleCategoryId(saleCategories.find((s) => s.status === "active")?.id ?? "");
    setExpenseCategoryId(expenseCategories.find((s) => s.status === "active")?.id ?? "");
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
      const noteValue = note.trim() || null;

      if (kind === "service") {
        await createBarbershopLedgerEntry({
          entry_type: "service",
          occurred_at,
          amount: n,
          payment_method: paymentMethod,
          note: noteValue,
          service_type_id: serviceTypeId,
          employee_user_id: employeeId,
        });
      } else if (kind === "sale") {
        await createBarbershopLedgerEntry({
          entry_type: "sale",
          occurred_at,
          amount: n,
          payment_method: paymentMethod,
          note: noteValue,
          sale_category_id: saleCategoryId,
        });
      } else {
        await createBarbershopLedgerEntry({
          entry_type: "expense",
          occurred_at,
          amount: n,
          payment_method: expensePaymentSource,
          note: noteValue,
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

  const triggerLabel = label ?? (locked ? meta.label : "Add entry");
  const dialogTitle = locked ? meta.dialogTitle : "Add ledger entry";
  const submitLabel = locked ? meta.submitLabel : "Save entry";
  const TriggerIcon = locked ? meta.Icon : Plus;

  const trigger =
    variant === "fab" ? (
      <Button
        type="button"
        size="icon-lg"
        aria-label={triggerLabel}
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full border border-[var(--border)] bg-[var(--foreground)] text-[var(--background)] shadow-[var(--shadow-elevated)]",
          "transition-opacity duration-200 hover:opacity-95 active:scale-[0.98]",
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
        <TriggerIcon className="mr-2 h-4 w-4" strokeWidth={1.75} />
        {triggerLabel}
      </Button>
    );

  return (
    <>
      {trigger}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(100%,26rem)]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form onSubmit={(e) => void submit(e)} className="space-y-5">
              {!locked ? (
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["service", "Service"],
                      ["sale", "Sale"],
                      ["expense", "Expense"],
                    ] as const
                  ).map(([id, chipLabel]) => (
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
                      {chipLabel}
                    </Button>
                  ))}
                </div>
              ) : null}

              {kind === "service" ? (
                <>
                  <ServiceTypeSelect
                    services={serviceTypes}
                    value={serviceTypeId}
                    onChange={setServiceTypeId}
                    onServicesChange={setServiceTypes}
                    canManage={canManageCatalog}
                    loading={catalogLoading}
                    label="Service"
                  />
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
                <CategorySelect
                  kind="sale"
                  categories={saleCategories}
                  value={saleCategoryId}
                  onChange={setSaleCategoryId}
                  onCategoriesChange={setSaleCategories}
                  canManage={canManageCatalog}
                  loading={catalogLoading}
                />
              ) : null}

              {kind === "expense" ? (
                <CategorySelect
                  kind="expense"
                  categories={expenseCategories}
                  value={expenseCategoryId}
                  onChange={setExpenseCategoryId}
                  onCategoriesChange={setExpenseCategories}
                  canManage={canManageCatalog}
                  loading={catalogLoading}
                />
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

              {kind === "expense" ? (
                <div className="space-y-1.5">
                  <Label>Payment source</Label>
                  <select
                    value={expensePaymentSource}
                    onChange={(e) =>
                      setExpensePaymentSource(e.target.value as ExpensePaymentSource)
                    }
                    className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                  >
                    {EXPENSE_PAYMENT_SOURCES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                    {
                      EXPENSE_PAYMENT_SOURCES.find((o) => o.value === expensePaymentSource)
                        ?.description
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Payment method</Label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as (typeof revenuePaymentMethods)[number])
                    }
                    className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm capitalize"
                  >
                    {revenuePaymentMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                {saving ? "Saving…" : submitLabel}
              </Button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
