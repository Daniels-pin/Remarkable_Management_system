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
  listDirectoryTeam,
  listExpenseCategories,
  listPendingReconciliationIndexes,
  listInventoryCategories,
  listInventoryProducts,
  listServiceTypes,
  type CategoryItem,
  type PendingReconciliationIndex,
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
  const [inventoryCategories, setInventoryCategories] = React.useState<
    { id: string; name: string }[]
  >([]);
  const [inventoryProducts, setInventoryProducts] = React.useState<
    {
      id: string;
      name: string;
      category_id: string;
      default_selling_price: string;
      stock_quantity: number;
    }[]
  >([]);
  const [expenseCategories, setExpenseCategories] = React.useState<CategoryItem[]>([]);
  const [teamMembers, setTeamMembers] = React.useState<{ id: string; name: string }[]>([]);

  const [serviceTypeId, setServiceTypeId] = React.useState("");
  const [employeeId, setEmployeeId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] =
    React.useState<(typeof revenuePaymentMethods)[number]>("cash");
  const [expensePaymentSource, setExpensePaymentSource] =
    React.useState<ExpensePaymentSource>("cash_shop");
  const [note, setNote] = React.useState("");
  const [businessDate, setBusinessDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [pendingIndexes, setPendingIndexes] = React.useState<PendingReconciliationIndex[]>([]);

  const [inventoryCategoryId, setInventoryCategoryId] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [customSellPrice, setCustomSellPrice] = React.useState("");
  const [useCustomPrice, setUseCustomPrice] = React.useState(false);
  const [expenseCategoryId, setExpenseCategoryId] = React.useState("");

  const hydrate = React.useCallback(async () => {
    setCatalogLoading(true);
    try {
      const [svc, invCats, invProds, exp, roster] = await Promise.all([
        listServiceTypes(),
        listInventoryCategories(),
        listInventoryProducts(),
        listExpenseCategories(),
        listDirectoryTeam(),
      ]);

      const svcItems = svc.items;
      const saleItems = invCats.items.filter((c) => c.status === "active");
      const prodItems = invProds.items.filter((p) => p.is_active);
      const expItems = exp.items;
      const memberItems = roster.items
        .filter((m) => m.role === "barber" || m.role === "staff")
        .map((m) => ({
          id: m.id,
          name: m.full_name?.trim() || `@${m.username}`,
        }));

      setServiceTypes(svcItems);
      setInventoryCategories(saleItems.map((c) => ({ id: c.id, name: c.name })));
      setInventoryProducts(
        prodItems.map((p) => ({
          id: p.id,
          name: p.name,
          category_id: p.category_id,
          default_selling_price: p.default_selling_price,
          stock_quantity: p.stock_quantity,
        })),
      );
      setExpenseCategories(expItems);
      setTeamMembers(memberItems);

      const firstActive = svcItems.find((s) => s.status === "active");
      const firstCat = saleItems[0];
      const firstExpense = expItems.find((s) => s.status === "active");
      setServiceTypeId((prev) => prev || firstActive?.id || "");
      setInventoryCategoryId((prev) => prev || firstCat?.id || "");
      const catId = firstCat?.id ?? "";
      const firstProd = prodItems.find((p) => p.category_id === catId) ?? prodItems[0];
      setProductId((prev) => prev || firstProd?.id || "");
      setExpenseCategoryId((prev) => prev || firstExpense?.id || "");
      setEmployeeId((prev) => prev || memberItems[0]?.id || "");
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

  React.useEffect(() => {
    if (!open || kind !== "service" || !employeeId || !businessDate) {
      setPendingIndexes([]);
      return;
    }
    let cancelled = false;
    void listPendingReconciliationIndexes(employeeId, businessDate)
      .then((res) => {
        if (cancelled) return;
        setPendingIndexes(res.items);
      })
      .catch(() => {
        if (!cancelled) setPendingIndexes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, kind, employeeId, businessDate]);

  function reset() {
    setAmount("");
    setNote("");
    setKind(entryType ?? "service");
    setServiceTypeId(serviceTypes.find((s) => s.status === "active")?.id ?? "");
    setEmployeeId(teamMembers[0]?.id ?? "");
    setPaymentMethod("cash");
    setExpensePaymentSource("cash_shop");
    const firstCat = inventoryCategories[0]?.id ?? "";
    setInventoryCategoryId(firstCat);
    setProductId(
      inventoryProducts.find((p) => p.category_id === firstCat)?.id ??
        inventoryProducts[0]?.id ??
        "",
    );
    setQuantity("1");
    setCustomSellPrice("");
    setUseCustomPrice(false);
    setExpenseCategoryId(expenseCategories.find((s) => s.status === "active")?.id ?? "");
    setBusinessDate(new Date().toISOString().slice(0, 10));
    setPendingIndexes([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/,/g, ""));
    if (kind !== "sale" && (!Number.isFinite(n) || n <= 0)) {
      toast.error("Enter a valid amount");
      return;
    }

    if (kind === "service") {
      if (!serviceTypeId) {
        toast.error("Pick a service type.");
        return;
      }
      if (!employeeId) {
        toast.error("Pick a team member for this service line.");
        return;
      }
    }
    if (kind === "sale") {
      if (!productId) {
        toast.error("Pick a product.");
        return;
      }
      if (!employeeId) {
        toast.error("Pick who sold this product.");
        return;
      }
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error("Enter a valid quantity.");
        return;
      }
      const selected = inventoryProducts.find((p) => p.id === productId);
      if (selected && selected.stock_quantity < qty) {
        toast.error(`Only ${selected.stock_quantity} in stock.`);
        return;
      }
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
        const body: Record<string, unknown> = {
          entry_type: "service",
          occurred_at,
          amount: n,
          payment_method: paymentMethod,
          note: noteValue,
          service_type_id: serviceTypeId,
          employee_user_id: employeeId,
        };
        await createBarbershopLedgerEntry(body);
      } else if (kind === "sale") {
        const qty = Number(quantity);
        const selected = inventoryProducts.find((p) => p.id === productId);
        const unitPrice = useCustomPrice
          ? Number(customSellPrice.replace(/,/g, ""))
          : Number(selected?.default_selling_price ?? 0);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          toast.error("Enter a valid selling price.");
          return;
        }
        await createBarbershopLedgerEntry({
          entry_type: "sale",
          occurred_at,
          payment_method: paymentMethod,
          note: noteValue,
          product_id: productId,
          quantity: qty,
          sold_by_user_id: employeeId,
          unit_selling_price: useCustomPrice ? unitPrice : undefined,
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

      const saleTotal =
        kind === "sale"
          ? (() => {
              const qty = Number(quantity);
              const selected = inventoryProducts.find((p) => p.id === productId);
              const unit = useCustomPrice
                ? Number(customSellPrice.replace(/,/g, ""))
                : Number(selected?.default_selling_price ?? 0);
              return qty * unit;
            })()
          : n;
      toast.success("Entry recorded", {
        description: `${kind.charAt(0).toUpperCase() + kind.slice(1)} · ${saleTotal.toLocaleString("en-NG")}`,
      });
      setOpen(false);
      reset();
      onCreated?.();
      if (kind === "service") {
        dispatchReconciliationUpdated();
      }
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
          "fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))] z-40 h-14 w-14 rounded-full border border-[var(--border)] bg-[var(--foreground)] text-[var(--background)] shadow-[var(--shadow-elevated)]",
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
                    <Label>Team member</Label>
                    <select
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                      disabled={catalogLoading}
                    >
                      {teamMembers.length === 0 ? (
                        <option value="">No team members in directory yet</option>
                      ) : (
                        teamMembers.map((em) => (
                          <option key={em.id} value={em.id}>
                            {em.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="biz-day">Business day</Label>
                    <Input
                      id="biz-day"
                      type="date"
                      value={businessDate}
                      onChange={(e) => setBusinessDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                    Records an independent manager index for this team member. It is compared to
                    their employee stream by index position — it does not modify employee submissions.
                  </p>
                  {pendingIndexes.length > 0 ? (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                        Employee indexes awaiting manager record
                      </p>
                      <ul className="mt-1 space-y-0.5 text-xs text-[var(--foreground)]">
                        {pendingIndexes.slice(0, 5).map((p) => (
                          <li key={p.entry_id}>
                            {p.index_label} · {p.service_name} · ₦
                            {Number(p.employee_amount).toLocaleString("en-NG")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}

              {kind === "sale" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <select
                      value={inventoryCategoryId}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setInventoryCategoryId(cat);
                        const first = inventoryProducts.find((p) => p.category_id === cat);
                        setProductId(first?.id ?? "");
                      }}
                      className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                      disabled={catalogLoading}
                    >
                      {inventoryCategories.length === 0 ? (
                        <option value="">No categories — add in Inventory</option>
                      ) : (
                        inventoryCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Product</Label>
                    <select
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                      className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                      disabled={catalogLoading}
                    >
                      {inventoryProducts
                        .filter((p) => p.category_id === inventoryCategoryId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.stock_quantity} in stock
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Quantity</Label>
                    <Input
                      inputMode="numeric"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sold by</Label>
                    <select
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                    >
                      {teamMembers.map((em) => (
                        <option key={em.id} value={em.id}>
                          {em.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useCustomPrice}
                      onChange={(e) => setUseCustomPrice(e.target.checked)}
                    />
                    Custom sale price
                  </label>
                  {useCustomPrice ? (
                    <div className="space-y-1.5">
                      <Label>Unit price (₦)</Label>
                      <Input
                        inputMode="decimal"
                        value={customSellPrice}
                        onChange={(e) => setCustomSellPrice(e.target.value)}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Default price: ₦
                      {Number(
                        inventoryProducts.find((p) => p.id === productId)
                          ?.default_selling_price ?? 0,
                      ).toLocaleString("en-NG")}
                    </p>
                  )}
                </>
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

              {kind !== "sale" ? (
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
              ) : null}

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
