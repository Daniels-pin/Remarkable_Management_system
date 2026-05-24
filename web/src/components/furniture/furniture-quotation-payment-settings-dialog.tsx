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
import {
  ApiError,
  getFurnitureQuotationPaymentSettings,
  updateFurnitureQuotationPaymentSettings,
} from "@/lib/api";

export function FurnitureQuotationPaymentSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [accountName, setAccountName] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [termsText, setTermsText] = React.useState("");
  const [primaryPhone, setPrimaryPhone] = React.useState("");
  const [secondaryPhone, setSecondaryPhone] = React.useState("");
  const [instagramHandle, setInstagramHandle] = React.useState("");
  const [companyAddress, setCompanyAddress] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    void getFurnitureQuotationPaymentSettings()
      .then((settings) => {
        setAccountName(settings.account_name ?? "");
        setAccountNumber(settings.account_number ?? "");
        setBankName(settings.bank_name ?? "");
        setTermsText(settings.terms_text);
        setPrimaryPhone(settings.primary_phone ?? "");
        setSecondaryPhone(settings.secondary_phone ?? "");
        setInstagramHandle(settings.instagram_handle ?? "");
        setCompanyAddress(settings.company_address ?? "");
      })
      .catch((err) => {
        const msg = err instanceof ApiError ? err.message : "Could not load document settings.";
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsText.trim()) {
      toast.error("Terms text is required.");
      return;
    }
    setSubmitting(true);
    try {
      await updateFurnitureQuotationPaymentSettings({
        account_name: accountName.trim() || null,
        account_number: accountNumber.trim() || null,
        bank_name: bankName.trim() || null,
        terms_text: termsText.trim(),
        primary_phone: primaryPhone.trim() || null,
        secondary_phone: secondaryPhone.trim() || null,
        instagram_handle: instagramHandle.trim() || null,
        company_address: companyAddress.trim() || null,
      });
      toast.success("Quotation document settings saved.");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not save document settings.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,42rem)] max-w-none">
        <DialogHeader>
          <DialogTitle>Quotation document settings</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)}>
          <DialogBody className="max-h-[min(70dvh,36rem)] space-y-8 overflow-y-auto">
            <p className="text-sm text-[var(--muted-foreground)]">
              Payment and company information appear automatically on generated quotations.
            </p>

            {loading ? (
              <p className="text-sm text-[var(--muted-foreground)]">Loading settings…</p>
            ) : (
              <>
                <section className="space-y-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Payment details
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="payment-bank">Bank name</Label>
                      <Input
                        id="payment-bank"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="e.g. GTBank"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payment-account-name">Account name</Label>
                      <Input
                        id="payment-account-name"
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="Account holder name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payment-account-number">Account number</Label>
                      <Input
                        id="payment-account-number"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="0123456789"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Company information
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company-primary-phone">Primary phone</Label>
                      <Input
                        id="company-primary-phone"
                        type="tel"
                        value={primaryPhone}
                        onChange={(e) => setPrimaryPhone(e.target.value)}
                        placeholder="+234 901 246 2061"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company-secondary-phone">Secondary phone</Label>
                      <Input
                        id="company-secondary-phone"
                        type="tel"
                        value={secondaryPhone}
                        onChange={(e) => setSecondaryPhone(e.target.value)}
                        placeholder="+234 706 097 9362"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="company-instagram">Instagram handle</Label>
                      <Input
                        id="company-instagram"
                        value={instagramHandle}
                        onChange={(e) => setInstagramHandle(e.target.value)}
                        placeholder="remarkable_furniture"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="company-address">Company address</Label>
                      <textarea
                        id="company-address"
                        value={companyAddress}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        rows={2}
                        className="flex min-h-[4rem] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
                        placeholder="Shinko Factory, Little Rayfield, Jos, Plateau State"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Terms &amp; conditions
                  </p>
                  <textarea
                    id="payment-terms"
                    value={termsText}
                    onChange={(e) => setTermsText(e.target.value)}
                    rows={4}
                    className="flex min-h-[6rem] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
                    placeholder="This document is a quotation for pricing and negotiation only."
                  />
                </section>
              </>
            )}
          </DialogBody>
          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] p-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || submitting} className="rounded-full">
              {submitting ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
