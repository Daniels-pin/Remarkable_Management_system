"use client";

import {
  Download,
  Eye,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Search,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { ConvertFurnitureToInvoiceDialog } from "@/components/furniture/convert-furniture-to-invoice-dialog";
import { FurnitureQuotationFormDialog } from "@/components/furniture/furniture-quotation-form-dialog";
import { FurnitureQuotationPaymentSettingsDialog } from "@/components/furniture/furniture-quotation-payment-settings-dialog";
import { FurnitureQuotationStatusBadge } from "@/components/furniture/furniture-quotation-status-badge";
import { ViewFurnitureQuotationDialog } from "@/components/furniture/view-furniture-quotation-dialog";
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
  convertFurnitureQuotationToOrder,
  downloadFurnitureQuotationPdf,
  finalizeFurnitureQuotation,
  getFurnitureQuotation,
  getFurnitureQuotationActiveAutosave,
  listFurnitureQuotations,
  type FurnitureQuotation,
} from "@/lib/api";
import { emitFurnitureUpdated, subscribeFurnitureResumeDraft, subscribeFurnitureUpdated } from "@/lib/furniture-events";
import { consumeFurnitureQuotationResumeId } from "@/lib/furniture-quotation-draft";
import { formatCatalogDate, formatNaira } from "@/lib/format";

export function FurnitureQuotationsPanel() {
  const [quotations, setQuotations] = React.useState<FurnitureQuotation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editQuotation, setEditQuotation] = React.useState<FurnitureQuotation | null>(null);
  const [viewQuotation, setViewQuotation] = React.useState<FurnitureQuotation | null>(null);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [convertQuotation, setConvertQuotation] = React.useState<FurnitureQuotation | null>(null);
  const [convertInvoiceOpen, setConvertInvoiceOpen] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const load = React.useCallback(async () => {
    try {
      const data = await listFurnitureQuotations(debouncedSearch || undefined);
      setQuotations(data.items);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not load quotations.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  React.useEffect(() => {
    queueMicrotask(() => void load());
    return subscribeFurnitureUpdated(() => void load());
  }, [load]);

  const resumeDraft = React.useCallback(async (quotationId: string) => {
    try {
      const fresh = await getFurnitureQuotation(quotationId);
      setEditQuotation(fresh);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not restore quotation draft.";
      toast.error(msg);
    }
  }, []);

  React.useEffect(() => {
    const resumeId = consumeFurnitureQuotationResumeId();
    if (resumeId) void resumeDraft(resumeId);
    return subscribeFurnitureResumeDraft((quotationId) => void resumeDraft(quotationId));
  }, [resumeDraft]);

  const openView = async (quotation: FurnitureQuotation) => {
    try {
      const fresh = await getFurnitureQuotation(quotation.id);
      setViewQuotation(fresh);
      setViewOpen(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not load quotation.";
      toast.error(msg);
    }
  };

  const openEdit = async (quotation: FurnitureQuotation) => {
    if (quotation.status === "converted") {
      toast.error("Converted quotations cannot be edited.");
      return;
    }
    try {
      const fresh = await getFurnitureQuotation(quotation.id);
      setEditQuotation(fresh);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not load quotation.";
      toast.error(msg);
    }
  };

  const handleFinalize = async (quotation: FurnitureQuotation) => {
    setActionId(quotation.id);
    try {
      await finalizeFurnitureQuotation(quotation.id);
      emitFurnitureUpdated();
      toast.success("Quotation finalized.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not finalize quotation.";
      toast.error(msg);
    } finally {
      setActionId(null);
    }
  };

  const handleConvert = async (quotation: FurnitureQuotation) => {
    if (quotation.status !== "finalized") {
      toast.error("Only finalized quotations can be converted to orders.");
      return;
    }
    setActionId(quotation.id);
    try {
      const result = await convertFurnitureQuotationToOrder(quotation.id);
      emitFurnitureUpdated();
      toast.success(`Order ${result.order.order_number} created from ${quotation.quotation_number}.`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not convert quotation.";
      toast.error(msg);
    } finally {
      setActionId(null);
    }
  };

  const handleDownload = async (quotation: FurnitureQuotation) => {
    setActionId(quotation.id);
    try {
      const blob = await downloadFurnitureQuotationPdf(quotation.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${quotation.quotation_number}.pdf`;
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

  const handlePrint = async (quotation: FurnitureQuotation) => {
    await openView(quotation);
  };

  const openCreate = async () => {
    try {
      const { draft } = await getFurnitureQuotationActiveAutosave();
      if (draft) {
        setEditQuotation(draft);
        return;
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not check for saved drafts.";
      toast.error(msg);
      return;
    }
    setCreateOpen(true);
  };

  const renderActions = (quotation: FurnitureQuotation) => {
    const busy = actionId === quotation.id;
    const canEdit = quotation.status !== "converted";
    const canFinalize = quotation.status === "draft";
    const canConvert = quotation.status === "finalized";
    const canConvertInvoice =
      !quotation.converted_invoice_id &&
      (quotation.status === "finalized" || quotation.status === "converted");

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={busy}>
            <MoreHorizontal className="h-3.5 w-3.5" />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => void openView(quotation)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          {canEdit ? (
            <DropdownMenuItem onClick={() => void openEdit(quotation)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => void handleDownload(quotation)}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handlePrint(quotation)}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </DropdownMenuItem>
          {canFinalize ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handleFinalize(quotation)}>
                <FileText className="mr-2 h-4 w-4" />
                Finalize
              </DropdownMenuItem>
            </>
          ) : null}
          {canConvert ? (
            <DropdownMenuItem onClick={() => void handleConvert(quotation)}>
              <Plus className="mr-2 h-4 w-4" />
              Convert to order
            </DropdownMenuItem>
          ) : null}
          {canConvertInvoice ? (
            <DropdownMenuItem
              onClick={() => {
                setConvertQuotation(quotation);
                setConvertInvoiceOpen(true);
              }}
            >
              <Receipt className="mr-2 h-4 w-4" />
              Convert to invoice
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quote number, customer, phone…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-full" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" />
            Document settings
          </Button>
          <Button
            className="rounded-full bg-[var(--foreground)] text-[var(--background)] hover:opacity-90"
            onClick={() => void openCreate()}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create quotation
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted-foreground)]">
          Loading quotations…
        </div>
      ) : quotations.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-10 text-center">
          <p className="font-[family-name:var(--font-serif)] text-lg font-semibold">No quotations yet</p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {debouncedSearch
              ? "No quotations match your search."
              : "Create your first quotation for customer pricing and proposals."}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)] md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30 text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  <th className="px-4 py-3 font-medium">Quote Number</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Total Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date Issued</th>
                  <th className="px-4 py-3 font-medium">Created By</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((quotation) => (
                  <tr key={quotation.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-medium">{quotation.quotation_number}</td>
                    <td className="px-4 py-3">
                      <div>{quotation.customer_name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {quotation.customer_phone}
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatNaira(quotation.grand_total)}</td>
                    <td className="px-4 py-3">
                      <FurnitureQuotationStatusBadge status={quotation.status} />
                      {quotation.converted_order_number ? (
                        <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                          → {quotation.converted_order_number}
                        </div>
                      ) : null}
                      {quotation.converted_invoice_number ? (
                        <Link
                          href="/furniture/invoices"
                          className="mt-1 block text-xs font-medium underline-offset-2 hover:underline"
                        >
                          Invoice {quotation.converted_invoice_number}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {formatCatalogDate(quotation.date_issued) ?? quotation.date_issued}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {quotation.created_by ?? "—"}
                    </td>
                    <td className="px-4 py-3">{renderActions(quotation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {quotations.map((quotation) => (
              <div
                key={quotation.id}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{quotation.quotation_number}</p>
                    <p className="text-sm">{quotation.customer_name}</p>
                  </div>
                  <FurnitureQuotationStatusBadge status={quotation.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      Total
                    </dt>
                    <dd className="font-medium">{formatNaira(quotation.grand_total)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      Date issued
                    </dt>
                    <dd>{formatCatalogDate(quotation.date_issued) ?? quotation.date_issued}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      Created by
                    </dt>
                    <dd>{quotation.created_by ?? "—"}</dd>
                  </div>
                </dl>
                <div className="mt-4">{renderActions(quotation)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <FurnitureQuotationFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => void load()}
      />
      <FurnitureQuotationFormDialog
        open={Boolean(editQuotation)}
        onOpenChange={(open) => {
          if (!open) setEditQuotation(null);
        }}
        quotation={editQuotation}
        onSaved={() => void load()}
      />
      <ViewFurnitureQuotationDialog
        quotation={viewQuotation}
        open={viewOpen}
        onOpenChange={setViewOpen}
      />
      <FurnitureQuotationPaymentSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ConvertFurnitureToInvoiceDialog
        source={convertQuotation ? { type: "quotation", data: convertQuotation } : null}
        open={convertInvoiceOpen}
        onOpenChange={setConvertInvoiceOpen}
        onConverted={() => void load()}
      />
    </div>
  );
}
