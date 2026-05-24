"use client";

import { Plus, Search } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { CreateFurnitureOrderDialog } from "@/components/furniture/create-furniture-order-dialog";
import { FurnitureOrderStatusBadge } from "@/components/furniture/furniture-order-status-badge";
import { RecordFurnitureDepositDialog } from "@/components/furniture/record-furniture-deposit-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  listFurnitureOrders,
  updateFurnitureOrderStatus,
  type FurnitureOrder,
  type FurnitureOrderStatus,
} from "@/lib/api";
import { emitFurnitureUpdated, subscribeFurnitureUpdated } from "@/lib/furniture-events";
import { formatCatalogDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: FurnitureOrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

export function FurnitureOrdersPanel() {
  const [orders, setOrders] = React.useState<FurnitureOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [depositOrder, setDepositOrder] = React.useState<FurnitureOrder | null>(null);
  const [depositOpen, setDepositOpen] = React.useState(false);
  const [statusUpdating, setStatusUpdating] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const load = React.useCallback(async () => {
    try {
      const data = await listFurnitureOrders(debouncedSearch || undefined);
      setOrders(data.items);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not load orders.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
    return subscribeFurnitureUpdated(() => void load());
  }, [load]);

  const handleStatusChange = async (order: FurnitureOrder, status: FurnitureOrderStatus) => {
    if (order.status === status) return;
    setStatusUpdating(order.id);
    try {
      await updateFurnitureOrderStatus(order.id, status);
      emitFurnitureUpdated();
      toast.success(`Order marked ${status.replace("_", " ")}.`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not update status.";
      toast.error(msg);
    } finally {
      setStatusUpdating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order ID, customer, phone…"
            className="pl-9"
          />
        </div>
        <Button
          className="rounded-full bg-[var(--foreground)] text-[var(--background)] hover:opacity-90"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Create order
        </Button>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted-foreground)]">
          Loading orders…
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-10 text-center">
          <p className="font-[family-name:var(--font-serif)] text-lg font-semibold">No orders yet</p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {debouncedSearch
              ? "No orders match your search."
              : "Create your first furniture order to begin tracking production."}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)] md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30 text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  <th className="px-4 py-3 font-medium">Order ID</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Deposit</th>
                  <th className="px-4 py-3 font-medium">Outstanding</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-medium">
                      <div>{order.order_number}</div>
                      {order.source_quotation_number ? (
                        <div className="text-xs text-[var(--muted-foreground)]">
                          From {order.source_quotation_number}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div>{order.customer_name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{order.customer_phone}</div>
                    </td>
                    <td className="px-4 py-3">{formatNaira(order.grand_total)}</td>
                    <td className="px-4 py-3">{formatNaira(order.deposit_paid)}</td>
                    <td
                      className={cn(
                        "px-4 py-3",
                        order.outstanding_balance > 0 && "font-medium text-rose-700 dark:text-rose-300",
                      )}
                    >
                      {formatNaira(order.outstanding_balance)}
                    </td>
                    <td className="px-4 py-3">
                      <FurnitureOrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {formatCatalogDate(order.due_date) ?? order.due_date}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {formatCatalogDate(order.created_at) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <select
                          className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-2 text-xs"
                          value={order.status}
                          disabled={statusUpdating === order.id}
                          onChange={(e) =>
                            void handleStatusChange(order, e.target.value as FurnitureOrderStatus)
                          }
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            setDepositOrder(order);
                            setDepositOpen(true);
                          }}
                        >
                          Record deposit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{order.order_number}</p>
                    <p className="text-sm">{order.customer_name}</p>
                  </div>
                  <FurnitureOrderStatusBadge status={order.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      Total
                    </dt>
                    <dd className="font-medium">{formatNaira(order.grand_total)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      Outstanding
                    </dt>
                    <dd className="font-medium">{formatNaira(order.outstanding_balance)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      Deposit
                    </dt>
                    <dd>{formatNaira(order.deposit_paid)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      Due
                    </dt>
                    <dd>{formatCatalogDate(order.due_date) ?? order.due_date}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-col gap-2">
                  <select
                    className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm"
                    value={order.status}
                    disabled={statusUpdating === order.id}
                    onChange={(e) =>
                      void handleStatusChange(order, e.target.value as FurnitureOrderStatus)
                    }
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDepositOrder(order);
                      setDepositOpen(true);
                    }}
                  >
                    Record deposit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <CreateFurnitureOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void load()}
      />
      <RecordFurnitureDepositDialog
        order={depositOrder}
        open={depositOpen}
        onOpenChange={setDepositOpen}
        onRecorded={() => void load()}
      />
    </div>
  );
}
