"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/auth-provider";
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
  createPersonalConsumption,
  getPersonalConsumptionReport,
  listInventoryProducts,
  listPersonalConsumptionConsumers,
  listPersonalConsumptions,
  voidPersonalConsumption,
  type PersonalConsumptionItem,
  type PersonalConsumptionReport,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

function statusTone(status: PersonalConsumptionItem["status"]) {
  if (status === "voided") return "text-[var(--muted-foreground)] line-through";
  return "text-[var(--foreground)]";
}

function DetailDialog({
  item,
  open,
  onOpenChange,
}: {
  item: PersonalConsumptionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;

  const rows: { label: string; value: string }[] = [
    { label: "Product", value: item.product_name ?? "—" },
    { label: "Quantity", value: String(item.quantity) },
    { label: "Selling value", value: formatNaira(Number(item.total_selling_value)) },
    { label: "Cost value", value: formatNaira(Number(item.total_cost_value)) },
    { label: "Consumed by", value: item.consumed_by_label ?? "—" },
    { label: "Recorded by", value: item.recorded_by_label ?? "—" },
    { label: "Business date", value: new Date(item.business_date).toLocaleDateString("en-NG") },
    { label: "Reason", value: item.reason },
    { label: "Notes", value: item.notes?.trim() || "—" },
    { label: "Status", value: item.status },
  ];

  if (item.status === "voided") {
    rows.push(
      { label: "Voided by", value: item.voided_by_label ?? "—" },
      { label: "Void reason", value: item.void_reason ?? "—" },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,28rem)]">
        <DialogHeader>
          <DialogTitle>Personal consumption</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 text-sm">
              <span className="text-[var(--muted-foreground)]">{row.label}</span>
              <span className="text-right font-medium">{row.value}</span>
            </div>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({
  target,
  open,
  onOpenChange,
  onVoided,
}: {
  target: PersonalConsumptionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoided: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setReason("");
  }, [open, target?.id]);

  async function submit() {
    if (!target || !reason.trim()) {
      toast.error("Void reason is required.");
      return;
    }
    setSaving(true);
    try {
      await voidPersonalConsumption(target.id, reason.trim());
      toast.success("Personal consumption voided.");
      onOpenChange(false);
      onVoided();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not void record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,28rem)]">
        <DialogHeader>
          <DialogTitle>Void personal consumption</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            This cannot be undone. Inventory will be restored automatically.
          </p>
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason (required)</Label>
            <Input
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being voided?"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={saving} onClick={() => void submit()}>
              {saving ? "Voiding…" : "Void record"}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function CreateConsumptionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [consumers, setConsumers] = React.useState<{ id: string; label: string }[]>([]);
  const [products, setProducts] = React.useState<
    { id: string; name: string; default_selling_price: string; stock_quantity: number }[]
  >([]);

  const [consumedById, setConsumedById] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [businessDate, setBusinessDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([listPersonalConsumptionConsumers(), listInventoryProducts()])
      .then(([consumerRes, inv]) => {
        setConsumers(consumerRes.items.map((c) => ({ id: c.id, label: c.label })));
        setProducts(
          inv.items
            .filter((p) => p.is_active && p.stock_quantity > 0)
            .map((p) => ({
              id: p.id,
              name: p.name,
              default_selling_price: p.default_selling_price,
              stock_quantity: p.stock_quantity,
            })),
        );
        if (consumerRes.items[0]) setConsumedById(consumerRes.items[0].id);
        if (inv.items[0]) setProductId(inv.items.filter((p) => p.is_active && p.stock_quantity > 0)[0]?.id ?? "");
      })
      .catch((e) => {
        toast.error(e instanceof ApiError ? e.message : "Could not load form data.");
      })
      .finally(() => setLoading(false));
  }, [open]);

  const selectedProduct = products.find((p) => p.id === productId);

  async function submit() {
    if (!consumedById || !productId || !reason.trim()) {
      toast.error("Product, consumed by, and reason are required.");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error("Enter a valid quantity.");
      return;
    }
    if (selectedProduct && qty > selectedProduct.stock_quantity) {
      toast.error(`Only ${selectedProduct.stock_quantity} unit(s) in stock.`);
      return;
    }
    setSaving(true);
    try {
      await createPersonalConsumption({
        product_id: productId,
        quantity: qty,
        consumed_by_user_id: consumedById,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        business_date: businessDate,
      });
      toast.success("Personal consumption recorded.");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not record consumption.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,28rem)]">
        <DialogHeader>
          <DialogTitle>Record personal consumption</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {loading ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="pc-product">Product</Label>
                <select
                  id="pc-product"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  {products.length === 0 ? (
                    <option value="">No products in stock</option>
                  ) : (
                    products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · Stock {p.stock_quantity} · {formatNaira(Number(p.default_selling_price))}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pc-qty">Quantity</Label>
                <Input
                  id="pc-qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pc-consumed-by">Consumed by</Label>
                <select
                  id="pc-consumed-by"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={consumedById}
                  onChange={(e) => setConsumedById(e.target.value)}
                >
                  {consumers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pc-reason">Reason</Label>
                <Input
                  id="pc-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Personal drink"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pc-notes">Notes (optional)</Label>
                <Input
                  id="pc-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pc-date">Business date</Label>
                <Input
                  id="pc-date"
                  type="date"
                  value={businessDate}
                  onChange={(e) => setBusinessDate(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={saving || products.length === 0}
                  onClick={() => void submit()}
                >
                  {saving ? "Saving…" : "Record"}
                </Button>
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-[var(--shadow-card)]">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function PersonalConsumptionPanel() {
  const { session } = useAuth();
  const canManage = session?.role === "admin" || session?.role === "manager";
  const now = React.useMemo(() => new Date(), []);
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [items, setItems] = React.useState<PersonalConsumptionItem[]>([]);
  const [report, setReport] = React.useState<PersonalConsumptionReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [voidTarget, setVoidTarget] = React.useState<PersonalConsumptionItem | null>(null);
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [detailTarget, setDetailTarget] = React.useState<PersonalConsumptionItem | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, reportRes] = await Promise.all([
        listPersonalConsumptions({ year, month }),
        canManage ? getPersonalConsumptionReport(year, month) : Promise.resolve(null),
      ]);
      setItems(listRes.items);
      setReport(reportRes);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load personal consumption.");
      setItems([]);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [year, month, canManage]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
            Personal consumption
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Products taken for personal use — reduces inventory without generating revenue or
            affecting payroll.
          </p>
        </div>
        {canManage ? (
          <Button type="button" className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Record consumption
          </Button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="month"
          value={`${year}-${String(month).padStart(2, "0")}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            if (y && m) {
              setYear(y);
              setMonth(m);
            }
          }}
          className="w-auto"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {canManage && report ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Personal consumption"
            value={formatNaira(Number(report.total_personal_consumption))}
          />
          <MetricCard
            label="Selling value"
            value={formatNaira(Number(report.total_selling_value))}
          />
          <MetricCard label="Records" value={String(report.record_count)} />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)]">
        {loading ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
            Loading personal consumption…
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
            No personal consumption for this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Consumed by</th>
                  <th className="px-4 py-3 font-medium text-right">Cost value</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Recorded by</th>
                  {canManage ? <th className="px-4 py-3 font-medium" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="cursor-pointer hover:bg-[var(--muted)]/30"
                    onClick={() => {
                      setDetailTarget(item);
                      setDetailOpen(true);
                    }}
                  >
                    <td className="px-4 py-3 tabular-nums">
                      {new Date(item.business_date).toLocaleDateString("en-NG")}
                    </td>
                    <td className="px-4 py-3 font-medium">{item.product_name ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-3">{item.consumed_by_label ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatNaira(Number(item.total_cost_value))}
                    </td>
                    <td className={cn("px-4 py-3 capitalize", statusTone(item.status))}>
                      {item.status}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {item.recorded_by_label ?? "—"}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {item.status === "active" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setVoidTarget(item);
                              setVoidOpen(true);
                            }}
                          >
                            Void
                          </Button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateConsumptionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void load()}
      />
      <VoidDialog
        target={voidTarget}
        open={voidOpen}
        onOpenChange={setVoidOpen}
        onVoided={() => void load()}
      />
      <DetailDialog item={detailTarget} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
