"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  getInventorySalesByRecorder,
  type InventoryRecorderSalesRow,
} from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { useAuth } from "@/components/providers/auth-provider";

type Preset = "today" | "week" | "month" | "year" | "all" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

export function InventoryEmployeeSalesPanel() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const [preset, setPreset] = React.useState<Preset>("month");
  const [from, setFrom] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [to, setTo] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<InventoryRecorderSalesRow[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInventorySalesByRecorder({
        preset: preset === "custom" ? "custom" : preset,
        from: preset === "custom" ? from : undefined,
        to: preset === "custom" ? to : undefined,
      });
      setRows(res.items);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load product sales report.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [preset, from, to]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const managerPresets = PRESETS.filter((p) => p.id !== "year" && p.id !== "all" && p.id !== "custom");
  const visiblePresets = isAdmin ? PRESETS : managerPresets;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {visiblePresets.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={preset === p.id ? "default" : "outline"}
              className={
                preset === p.id
                  ? "rounded-full border-transparent bg-[var(--foreground)] text-[var(--background)]"
                  : "rounded-full border-dashed"
              }
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {preset === "custom" && isAdmin ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sales-from" className="text-xs">
                From
              </Label>
              <Input
                id="sales-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sales-to" className="text-xs">
                To
              </Label>
              <Input
                id="sales-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-40"
              />
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading report…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-6 py-10 text-center text-sm text-[var(--muted-foreground)]">
          No product sales recorded for this period.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.recorded_by_user_id}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <p className="font-medium text-[var(--foreground)]">
                {row.recorded_by_label ?? "Unknown"}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">Units sold</dt>
                  <dd className="font-medium tabular-nums">{row.units_sold}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">Revenue</dt>
                  <dd className="font-medium tabular-nums">{formatNaira(Number(row.revenue))}</dd>
                </div>
                {isAdmin ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--muted-foreground)]">Profit</dt>
                    <dd className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatNaira(Number(row.profit))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
