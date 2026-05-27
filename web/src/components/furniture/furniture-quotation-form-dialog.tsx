"use client";

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
import { FurnitureOperationalPercentInput } from "@/components/furniture/furniture-operational-percent-input";
import {
  preventFurnitureFormEnterSubmit,
  preventFurnitureFormNativeSubmit,
} from "@/components/furniture/furniture-form-handlers";
import { FurnitureQuotationSectionEditor } from "@/components/furniture/furniture-quotation-section-editor";
import { useAuth } from "@/components/providers/auth-provider";
import {
  ApiError,
  autosaveFurnitureQuotation,
  createFurnitureQuotation,
  updateFurnitureQuotation,
  type FurnitureQuotation,
} from "@/lib/api";
import { emitFurnitureUpdated } from "@/lib/furniture-events";
import {
  furnitureQuotationTaxPercentFromAmount,
  furnitureQuotationTotals,
} from "@/lib/furniture-quotation-calculations";
import {
  clearFurnitureQuotationDraft,
  customerNameFromDraft,
  customerPhoneFromDraft,
  hasQuotationDraftContent,
  sectionTitleFromDraft,
  writeFurnitureQuotationDraft,
} from "@/lib/furniture-quotation-draft";
import {
  buildQuotationSectionsAutosavePayload,
  buildQuotationSectionsPayload,
  emptyQuotationSectionRow,
  quotationSectionsFromApi,
  quotationSectionsSubtotal,
  type FurnitureQuotationSectionRow,
} from "@/lib/furniture-quotation-sections";
import { formatNaira } from "@/lib/format";

const AUTOSAVE_DEBOUNCE_MS = 800;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export function FurnitureQuotationFormDialog({
  open,
  onOpenChange,
  quotation,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation?: FurnitureQuotation | null;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const isEdit = Boolean(quotation);
  const isAutosaveSession = Boolean(quotation?.is_autosave_session);

  const [customerName, setCustomerName] = React.useState("");
  const [customerAddress, setCustomerAddress] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [dateIssued, setDateIssued] = React.useState(todayIsoDate());
  const [discount, setDiscount] = React.useState("");
  const [taxPercent, setTaxPercent] = React.useState("");
  const [sections, setSections] = React.useState<FurnitureQuotationSectionRow[]>([
    emptyQuotationSectionRow(),
  ]);
  const [submitting, setSubmitting] = React.useState(false);
  const [autosaveQuotationId, setAutosaveQuotationId] = React.useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = React.useState<AutosaveStatus>("idle");
  const hydratedRef = React.useRef(false);
  const autosaveRequestRef = React.useRef(0);

  React.useEffect(() => {
    if (!open) {
      hydratedRef.current = false;
      setAutosaveStatus("idle");
      return;
    }
    if (quotation) {
      setCustomerName(customerNameFromDraft(quotation.customer_name, quotation.customer_phone));
      setCustomerAddress(quotation.customer_address ?? "");
      setCustomerPhone(customerPhoneFromDraft(quotation.customer_name, quotation.customer_phone));
      setDateIssued(quotation.date_issued);
      setDiscount(quotation.discount > 0 ? String(quotation.discount) : "");
      setTaxPercent(furnitureQuotationTaxPercentFromAmount(quotation.subtotal, quotation.tax));
      setSections(
        quotationSectionsFromApi(quotation.sections).map((section) => ({
          ...section,
          title: sectionTitleFromDraft(section.title, Boolean(quotation.is_autosave_session)),
        })),
      );
      setAutosaveQuotationId(quotation.id);
    } else {
      setCustomerName("");
      setCustomerAddress("");
      setCustomerPhone("");
      setDateIssued(todayIsoDate());
      setDiscount("");
      setTaxPercent("");
      setSections([emptyQuotationSectionRow()]);
      setAutosaveQuotationId(null);
    }
    setSubmitting(false);
    hydratedRef.current = true;
  }, [open, quotation]);

  const subtotal = quotationSectionsSubtotal(sections);
  const { discountValue, taxPercent: taxPercentValue, taxAmount, grandTotal } =
    furnitureQuotationTotals({
      subtotal,
      discountInput: discount,
      taxPercentInput: taxPercent,
    });

  const draftSnapshot = React.useMemo(
    () => ({
      customerName,
      customerAddress,
      customerPhone,
      discount,
      taxPercent,
      sections,
    }),
    [customerAddress, customerName, customerPhone, discount, sections, taxPercent],
  );

  const persistLocalDraft = React.useCallback(
    (quotationId: string | null) => {
      if (!session?.user_id) return;
      writeFurnitureQuotationDraft({
        userId: session.user_id,
        quotationId,
        savedAt: new Date().toISOString(),
        customerName,
        customerAddress,
        customerPhone,
        dateIssued,
        discount,
        taxPercent,
        sections,
      });
    },
    [
      customerAddress,
      customerName,
      customerPhone,
      dateIssued,
      discount,
      sections,
      session?.user_id,
      taxPercent,
    ],
  );

  React.useEffect(() => {
    if (!open || !hydratedRef.current || submitting || !session?.user_id) return;
    if (!hasQuotationDraftContent(draftSnapshot)) return;

    const requestId = autosaveRequestRef.current + 1;
    autosaveRequestRef.current = requestId;

    const timer = window.setTimeout(() => {
      void (async () => {
        setAutosaveStatus("saving");
        persistLocalDraft(autosaveQuotationId);

        try {
          const saved = await autosaveFurnitureQuotation({
            quotation_id: autosaveQuotationId ?? quotation?.id ?? null,
            customer_name: customerName.trim(),
            customer_address: customerAddress.trim() || null,
            customer_phone: customerPhone.trim(),
            date_issued: dateIssued,
            sections: buildQuotationSectionsAutosavePayload(sections),
            discount: discountValue,
            tax: taxAmount,
          });

          if (autosaveRequestRef.current !== requestId) return;

          setAutosaveQuotationId(saved.id);
          persistLocalDraft(saved.id);
          setAutosaveStatus("saved");
        } catch {
          if (autosaveRequestRef.current !== requestId) return;
          setAutosaveStatus("error");
        }
      })();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    autosaveQuotationId,
    customerAddress,
    customerName,
    customerPhone,
    dateIssued,
    discountValue,
    draftSnapshot,
    open,
    persistLocalDraft,
    quotation?.id,
    sections,
    session?.user_id,
    submitting,
    taxAmount,
  ]);

  const submit = async () => {
    if (!customerName.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    if (!customerPhone.trim()) {
      toast.error("Phone number is required.");
      return;
    }
    if (!dateIssued) {
      toast.error("Date issued is required.");
      return;
    }

    const payloadSections = buildQuotationSectionsPayload(sections);
    if (payloadSections.length === 0) {
      toast.error("Add at least one section subheading with a priced item.");
      return;
    }

    const validItems = payloadSections.flatMap((section) => section.items);
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

    if (discountValue > subtotal) {
      toast.error("Discount cannot exceed subtotal.");
      return;
    }

    const payload = {
      customer_name: customerName.trim(),
      customer_address: customerAddress.trim() || null,
      customer_phone: customerPhone.trim(),
      date_issued: dateIssued,
      discount: discountValue,
      tax: taxAmount,
      sections: payloadSections,
    };

    setSubmitting(true);
    try {
      const targetId = autosaveQuotationId ?? quotation?.id ?? null;
      if (targetId) {
        await updateFurnitureQuotation(targetId, payload);
        toast.success(
          quotation?.status === "finalized"
            ? "Quotation updated and reverted to draft."
            : isAutosaveSession
              ? "Quotation saved."
              : "Quotation updated.",
        );
      } else {
        await createFurnitureQuotation(payload);
        toast.success("Quotation created.");
      }
      clearFurnitureQuotationDraft();
      emitFurnitureUpdated();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not save quotation.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const autosaveLabel =
    autosaveStatus === "saving"
      ? "Saving…"
      : autosaveStatus === "saved"
        ? "Draft saved"
        : autosaveStatus === "error"
          ? "Autosave failed"
          : null;

  const dialogTitle = isAutosaveSession
    ? "Continue quotation draft"
    : isEdit
      ? "Edit quotation"
      : "Create quotation";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,42rem)] max-w-none">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>{dialogTitle}</DialogTitle>
            {autosaveLabel ? (
              <span
                className={`shrink-0 pt-1 text-xs ${
                  autosaveStatus === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-[var(--muted-foreground)]"
                }`}
              >
                {autosaveLabel}
              </span>
            ) : null}
          </div>
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
                  <Label htmlFor="quote-customer-name">Customer name</Label>
                  <Input
                    id="quote-customer-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="quote-customer-address">Address</Label>
                  <Input
                    id="quote-customer-address"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Billing / delivery address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quote-customer-phone">Phone number</Label>
                  <Input
                    id="quote-customer-phone"
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+234 …"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quote-date-issued">Date issued</Label>
                  <Input
                    id="quote-date-issued"
                    type="date"
                    value={dateIssued}
                    onChange={(e) => setDateIssued(e.target.value)}
                    required
                  />
                </div>
              </div>
            </section>

            <FurnitureQuotationSectionEditor sections={sections} onChange={setSections} />

            <section className="space-y-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Totals
              </p>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted-foreground)]">Subtotal</span>
                  <span className="font-medium">{formatNaira(subtotal)}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quote-discount">Discount (optional)</Label>
                    <FurnitureOperationalAmountInput
                      id="quote-discount"
                      value={discount}
                      onValueChange={setDiscount}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quote-tax">Tax rate (optional)</Label>
                    <FurnitureOperationalPercentInput
                      id="quote-tax"
                      value={taxPercent}
                      onValueChange={setTaxPercent}
                      placeholder="0"
                    />
                  </div>
                </div>
                {taxAmount > 0 ? (
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-[var(--muted-foreground)]">
                      Tax ({taxPercentValue}%)
                    </span>
                    <span className="font-medium">{formatNaira(taxAmount)}</span>
                  </div>
                ) : null}
                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
                  <span className="font-medium">Grand total</span>
                  <span className="font-[family-name:var(--font-serif)] text-xl font-semibold">
                    {formatNaira(grandTotal)}
                  </span>
                </div>
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
              {submitting ? "Saving…" : isEdit || autosaveQuotationId ? "Save changes" : "Create quotation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
