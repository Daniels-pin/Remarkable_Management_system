"use client";

import {
  Copy,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Search,
  Share2,
  Trash2,
  Wallet,
  Ban,
  Send,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { CreateFurnitureInvoiceDialog } from "@/components/furniture/create-furniture-invoice-dialog";
import { FurnitureInvoiceStatusBadge } from "@/components/furniture/furniture-invoice-status-badge";
import { RecordFurnitureInvoicePaymentDialog } from "@/components/furniture/record-furniture-invoice-payment-dialog";
import { ViewFurnitureInvoiceDialog } from "@/components/furniture/view-furniture-invoice-dialog";
import { VoidFurnitureInvoiceDialog } from "@/components/furniture/void-furniture-invoice-dialog";
import { SummaryMetricCard } from "@/components/ops/summary-metric-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  deleteFurnitureInvoice,
  downloadFurnitureInvoicePdf,
  duplicateFurnitureInvoice,
  getFurnitureInvoice,
  getFurnitureInvoiceDashboardSummary,
  listFurnitureInvoices,
  sendFurnitureInvoice,
  type FurnitureInvoice,
  type FurnitureInvoiceDashboardSummary,
  type FurnitureInvoicePeriod,
} from "@/lib/api";
import { emitFurnitureUpdated, subscribeFurnitureUpdated } from "@/lib/furniture-events";
import { formatCatalogDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIODS: { value: FurnitureInvoicePeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All Time" },
];

const STATUS_FILTERS = [
  "all",
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "overdue",
  "voided",
] as const;

export function FurnitureInvoicesPanel() {
  const [summary, setSummary] = React.useState<FurnitureInvoiceDashboardSummary | null>(null);
  const [invoices, setInvoices] = React.useState<FurnitureInvoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [period, setPeriod] = React.useState<FurnitureInvoicePeriod>("month");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editInvoice, setEditInvoice] = React.useState<FurnitureInvoice | null>(null);
  const [viewInvoice, setViewInvoice] = React.useState<FurnitureInvoice | null>(null);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [paymentInvoice, setPaymentInvoice] = React.useState<FurnitureInvoice | null>(null);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [voidInvoice, setVoidInvoice] = React.useState<FurnitureInvoice | null>(null);
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const load = React.useCallback(async () => {
    try {
      const [summaryData, listData] = await Promise.all([
        getFurnitureInvoiceDashboardSummary({ period }),
        listFurnitureInvoices({
          q: debouncedSearch || undefined,
          status: statusFilter,
          period,
        }),
      ]);
      setSummary(summaryData);
      setInvoices(listData.items);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not load invoices.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, period, statusFilter]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
    return subscribeFurnitureUpdated(() => void load());
  }, [load]);

  const openView = async (invoice: FurnitureInvoice) => {
    try {
      const fresh = await getFurnitureInvoice(invoice.id);
      setViewInvoice(fresh);
      setViewOpen(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not load invoice.";
      toast.error(msg);
    }
  };

  const openEdit = async (invoice: FurnitureInvoice) => {
    if (invoice.status === "voided") {
      toast.error("Voided invoices are read-only.");
      return;
    }
    try {
      const fresh = await getFurnitureInvoice(invoice.id);
      setEditInvoice(fresh);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not load invoice.";
      toast.error(msg);
    }
  };

  const handleDownload = async (invoice: FurnitureInvoice) => {
    setActionId(invoice.id);
    try {
      const blob = await downloadFurnitureInvoicePdf(invoice.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${invoice.invoice_number}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not download PDF.";
      toast.error(msg);
    } finally {
      setActionId(null);
    }
  };

  const handleDuplicate = async (invoice: FurnitureInvoice) => {
    setActionId(invoice.id);
    try {
      const copy = await duplicateFurnitureInvoice(invoice.id);
      emitFurnitureUpdated();
      toast.success(`Duplicate ${copy.invoice_number} created.`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not duplicate invoice.";
      toast.error(msg);
    } finally {
      setActionId(null);
    }
  };

  const handleSend = async (invoice: FurnitureInvoice) => {
    setActionId(invoice.id);
    try {
      await sendFurnitureInvoice(invoice.id);
      emitFurnitureUpdated();
      toast.success("Invoice sent.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not send invoice.";
      toast.error(msg);
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (invoice: FurnitureInvoice) => {
    if (invoice.status !== "draft") {
      toast.error("Only draft invoices can be deleted.");
      return;
    }
    if (!window.confirm(`Delete draft ${invoice.invoice_number}?`)) return;
    setActionId(invoice.id);
    try {
      await deleteFurnitureInvoice(invoice.id);
      emitFurnitureUpdated();
      toast.success("Invoice deleted.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not delete invoice.";
      toast.error(msg);
    } finally {
      setActionId(null);
    }
  };

  const renderActions = (invoice: FurnitureInvoice) => {
    const busy = actionId === invoice.id;
    const isVoided = invoice.status === "voided";
    const isDraft = invoice.status === "draft";
    const canPay =
      !isVoided &&
      !isDraft &&
      invoice.balance_due > 0;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={busy}>
            <MoreHorizontal className="h-3.5 w-3.5" />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => void openView(invoice)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          {!isVoided ? (
            <DropdownMenuItem onClick={() => void openEdit(invoice)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          ) : null}
          {isDraft ? (
            <DropdownMenuItem onClick={() => void handleSend(invoice)}>
              <Send className="mr-2 h-4 w-4" />
              Send
            </DropdownMenuItem>
          ) : null}
          {canPay ? (
            <DropdownMenuItem
              onClick={() => {
                setPaymentInvoice(invoice);
                setPaymentOpen(true);
              }}
            >
              <Wallet className="mr-2 h-4 w-4" />
              Record Payment
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => void handleDuplicate(invoice)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void openView(invoice)}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleDownload(invoice)}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleDownload(invoice)}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </DropdownMenuItem>
          {!isVoided ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-rose-700 focus:text-rose-700"
                onClick={() => {
                  setVoidInvoice(invoice);
                  setVoidOpen(true);
                }}
              >
                <Ban className="mr-2 h-4 w-4" />
                Void
              </DropdownMenuItem>
            </>
          ) : null}
          {isDraft ? (
            <DropdownMenuItem
              className="text-rose-700 focus:text-rose-700"
              onClick={() => void handleDelete(invoice)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.value}
            type="button"
            variant={period === p.value ? "default" : "outline"}
            size="sm"
            className={cn(
              "rounded-full",
              period === p.value && "bg-[var(--foreground)] text-[var(--background)]",
            )}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricCard label="Total Invoices" value={String(summary?.total_invoices ?? "—")} />
        <SummaryMetricCard label="Draft" value={String(summary?.draft ?? "—")} tone="muted" />
        <SummaryMetricCard label="Sent" value={String(summary?.sent ?? "—")} />
        <SummaryMetricCard
          label="Partially Paid"
          value={String(summary?.partially_paid ?? "—")}
          tone="muted"
        />
        <SummaryMetricCard label="Paid" value={String(summary?.paid ?? "—")} tone="positive" />
        <SummaryMetricCard label="Overdue" value={String(summary?.overdue ?? "—")} tone="negative" />
        <SummaryMetricCard
          label="Outstanding Balance"
          value={summary ? formatNaira(summary.outstanding_balance) : "—"}
          tone="negative"
        />
        <SummaryMetricCard
          label="Revenue Collected"
          value={summary ? formatNaira(summary.revenue_collected) : "—"}
          tone="positive"
        />
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Customer, invoice #, order, quote…"
              className="pl-9"
            />
          </div>
          <Button
            className="rounded-full bg-[var(--foreground)] text-[var(--background)] hover:bg-[var(--foreground)]/90"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              type="button"
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              className={cn(
                "rounded-full capitalize",
                statusFilter === s && "bg-[var(--foreground)] text-[var(--background)]",
              )}
              onClick={() => setStatusFilter(s)}
            >
              {s.replace("_", " ")}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed p-12 text-center text-sm text-[var(--muted-foreground)]">
          Loading invoices…
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed p-12 text-center text-sm text-[var(--muted-foreground)]">
          No invoices found.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--card)] shadow-[var(--shadow-card)] md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[var(--muted)]/30 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Created From</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Grand Total</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice, index) => (
                  <tr key={invoice.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{index + 1}</td>
                    <td className="px-4 py-3 font-medium">{invoice.invoice_number}</td>
                    <td className="px-4 py-3">{invoice.customer_name}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{invoice.created_from}</td>
                    <td className="px-4 py-3">
                      {formatCatalogDate(invoice.date_issued) ?? invoice.date_issued}
                    </td>
                    <td className="px-4 py-3 text-right">{formatNaira(invoice.grand_total)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">
                      {formatNaira(invoice.amount_paid)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-medium",
                        invoice.balance_due > 0 ? "text-rose-700" : "",
                      )}
                    >
                      {formatNaira(invoice.balance_due)}
                    </td>
                    <td className="px-4 py-3">
                      <FurnitureInvoiceStatusBadge status={invoice.status} />
                    </td>
                    <td className="px-4 py-3">{renderActions(invoice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {invoices.map((invoice, index) => (
              <div
                key={invoice.id}
                className="rounded-[var(--radius-lg)] border bg-[var(--card)] p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-[var(--muted-foreground)]">#{index + 1}</p>
                    <p className="font-medium">{invoice.invoice_number}</p>
                    <p className="text-sm text-[var(--muted-foreground)]">{invoice.customer_name}</p>
                  </div>
                  <FurnitureInvoiceStatusBadge status={invoice.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] uppercase text-[var(--muted-foreground)]">Total</p>
                    <p>{formatNaira(invoice.grand_total)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase text-[var(--muted-foreground)]">Balance</p>
                    <p className={invoice.balance_due > 0 ? "text-rose-700" : ""}>
                      {formatNaira(invoice.balance_due)}
                    </p>
                  </div>
                </div>
                <div className="mt-3">{renderActions(invoice)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <CreateFurnitureInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => void load()}
      />
      <CreateFurnitureInvoiceDialog
        invoice={editInvoice}
        open={Boolean(editInvoice)}
        onOpenChange={(open) => {
          if (!open) setEditInvoice(null);
        }}
        onSaved={() => {
          setEditInvoice(null);
          void load();
        }}
      />
      <ViewFurnitureInvoiceDialog
        invoice={viewInvoice}
        open={viewOpen}
        onOpenChange={setViewOpen}
      />
      <RecordFurnitureInvoicePaymentDialog
        invoice={paymentInvoice}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        onRecorded={() => void load()}
      />
      <VoidFurnitureInvoiceDialog
        invoice={voidInvoice}
        open={voidOpen}
        onOpenChange={setVoidOpen}
        onVoided={() => void load()}
      />
    </div>
  );
}
