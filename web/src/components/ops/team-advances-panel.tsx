"use client";

import * as React from "react";
import { HandCoins, Package, Plus } from "lucide-react";
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
  createCashTeamAdvance,
  createProductTeamAdvance,
  getTeamAdvancesReport,
  listDirectoryTeam,
  listInventoryProducts,
  listTeamAdvances,
  voidTeamAdvance,
  type TeamAdvanceItem,
  type TeamAdvancesReport,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { dispatchReconciliationUpdated } from "@/lib/reconciliation-events";
import { cn } from "@/lib/utils";

type AdvanceFormKind = "cash" | "product";

function statusTone(status: TeamAdvanceItem["status"]) {
  if (status === "deducted") return "text-emerald-700 dark:text-emerald-300";
  if (status === "voided") return "text-[var(--muted-foreground)] line-through";
  return "text-amber-800 dark:text-amber-200";
}

function VoidDialog({
  target,
  open,
  onOpenChange,
  onVoided,
}: {
  target: TeamAdvanceItem | null;
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
      await voidTeamAdvance(target.id, reason.trim());
      toast.success("Team advance voided.");
      onOpenChange(false);
      onVoided();
      dispatchReconciliationUpdated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not void advance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,28rem)]">
        <DialogHeader>
          <DialogTitle>Void team advance</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            This cannot be undone.{" "}
            {target?.advance_type === "product"
              ? "Inventory will be restored automatically."
              : "Payroll calculations will update immediately."}
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
              {saving ? "Voiding…" : "Void advance"}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function CreateAdvanceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = React.useState<AdvanceFormKind>("cash");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [team, setTeam] = React.useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = React.useState<
    { id: string; name: string; default_selling_price: string; stock_quantity: number }[]
  >([]);

  const [employeeId, setEmployeeId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [businessDate, setBusinessDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [productId, setProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([listDirectoryTeam(), listInventoryProducts()])
      .then(([roster, inv]) => {
        setTeam(
          roster.items
            .filter((m) => m.role === "barber" || m.role === "staff")
            .map((m) => ({
              id: m.id,
              name: m.full_name?.trim() || `@${m.username}`,
            })),
        );
        setProducts(
          inv.items
            .filter((p) => p.is_active)
            .map((p) => ({
              id: p.id,
              name: p.name,
              default_selling_price: p.default_selling_price,
              stock_quantity: p.stock_quantity,
            })),
        );
      })
      .catch(() => toast.error("Could not load form data."))
      .finally(() => setLoading(false));
  }, [open]);

  const selectedProduct = products.find((p) => p.id === productId);
  const productTotal =
    selectedProduct && quantity
      ? Number(selectedProduct.default_selling_price) * Number(quantity)
      : 0;

  async function submit() {
    if (!employeeId || !reason.trim() || !businessDate) {
      toast.error("Employee, reason, and business date are required.");
      return;
    }
    setSaving(true);
    try {
      if (kind === "cash") {
        const parsed = Number(amount);
        if (!parsed || parsed <= 0) {
          toast.error("Enter a valid amount.");
          return;
        }
        await createCashTeamAdvance({
          employee_user_id: employeeId,
          amount: String(parsed),
          reason: reason.trim(),
          notes: notes.trim() || undefined,
          business_date: businessDate,
        });
      } else {
        const qty = Number(quantity);
        if (!productId || !qty || qty <= 0) {
          toast.error("Select a product and quantity.");
          return;
        }
        await createProductTeamAdvance({
          employee_user_id: employeeId,
          product_id: productId,
          quantity: qty,
          reason: reason.trim(),
          notes: notes.trim() || undefined,
          business_date: businessDate,
        });
      }
      toast.success("Team advance recorded.");
      onOpenChange(false);
      onCreated();
      dispatchReconciliationUpdated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not record advance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,32rem)]">
        <DialogHeader>
          <DialogTitle>Record team advance</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex gap-2">
            {(["cash", "product"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm",
                  kind === k
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                    : "border-[var(--border)] text-[var(--muted-foreground)]",
                )}
              >
                {k === "cash" ? <HandCoins className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                {k === "cash" ? "Cash advance" : "Product advance"}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Employee</Label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                >
                  <option value="">Select team member</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {kind === "cash" ? (
                <div className="space-y-2">
                  <Label>Amount (₦)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Product</Label>
                    <select
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                      className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.stock_quantity} in stock ·{" "}
                          {formatNaira(Number(p.default_selling_price))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </div>
                  {selectedProduct ? (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Advance amount:{" "}
                      <span className="font-medium tabular-nums text-[var(--foreground)]">
                        {formatNaira(productTotal)}
                      </span>
                    </p>
                  ) : null}
                </>
              )}

              <div className="space-y-2">
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Business date</Label>
                <Input
                  type="date"
                  value={businessDate}
                  onChange={(e) => setBusinessDate(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || loading} onClick={() => void submit()}>
              {saving ? "Saving…" : "Record advance"}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function TeamAdvancesPanel() {
  const { session } = useAuth();
  const canManage = session?.role === "admin" || session?.role === "manager";
  const now = React.useMemo(() => new Date(), []);
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [items, setItems] = React.useState<TeamAdvanceItem[]>([]);
  const [report, setReport] = React.useState<TeamAdvancesReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [voidTarget, setVoidTarget] = React.useState<TeamAdvanceItem | null>(null);
  const [voidOpen, setVoidOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, reportRes] = await Promise.all([
        listTeamAdvances({ year, month }),
        canManage ? getTeamAdvancesReport(year, month) : Promise.resolve(null),
      ]);
      setItems(listRes.items);
      setReport(reportRes);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load team advances.");
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
            Team advances
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Cash borrowed and products taken on credit — recovered through payroll, not shop
            expenses.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            className="rounded-full"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Record advance
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total advances" value={formatNaira(Number(report.total_team_advances))} />
          <MetricCard label="Outstanding" value={formatNaira(Number(report.total_outstanding))} />
          <MetricCard label="Cash advances" value={formatNaira(Number(report.total_cash_advances))} />
          <MetricCard
            label="Product advances"
            value={formatNaira(Number(report.total_product_advances))}
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)]">
        {loading ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
            Loading team advances…
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
            No team advances for this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Recorded by</th>
                  {canManage ? <th className="px-4 py-3 font-medium" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 tabular-nums">
                      {new Date(item.business_date).toLocaleDateString("en-NG")}
                    </td>
                    <td className="px-4 py-3 font-medium">{item.employee_name ?? "—"}</td>
                    <td className="px-4 py-3 capitalize">{item.advance_type}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {item.advance_type === "product" && item.product_name ? (
                        <>
                          {item.product_name} · Qty {item.quantity}
                        </>
                      ) : (
                        item.reason
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatNaira(Number(item.amount))}
                    </td>
                    <td className={cn("px-4 py-3 capitalize", statusTone(item.status))}>
                      {item.status}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {item.recorded_by_label ?? "—"}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right">
                        {item.status === "outstanding" ? (
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

      <CreateAdvanceDialog
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
    </div>
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
