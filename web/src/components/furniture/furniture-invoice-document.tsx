"use client";

import * as React from "react";

import { FurnitureInvoiceStatusBadge } from "@/components/furniture/furniture-invoice-status-badge";
import type { FurnitureInvoice, FurnitureQuotationPaymentSettings } from "@/lib/api";
import { formatCatalogDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#888888]">
      {children}
    </p>
  );
}

function SectionRule() {
  return <hr className="border-0 border-t border-[#e5e5e5]" />;
}

function instagramDisplay(handle: string | null | undefined) {
  if (!handle?.trim()) return null;
  const cleaned = handle.trim().replace(/^@/, "");
  return cleaned ? `@${cleaned}` : null;
}

export function FurnitureInvoiceDocument({
  invoice,
  paymentSettings,
  className,
  printId = "furniture-invoice-document",
}: {
  invoice: FurnitureInvoice;
  paymentSettings: FurnitureQuotationPaymentSettings | null;
  className?: string;
  printId?: string;
}) {
  const isVoided = invoice.status === "voided";
  const issuedLabel = formatCatalogDate(invoice.date_issued) ?? invoice.date_issued;
  const dueLabel = formatCatalogDate(invoice.due_date) ?? invoice.due_date;
  const instagram = instagramDisplay(paymentSettings?.instagram_handle);
  const hasPayment =
    paymentSettings?.bank_name ||
    paymentSettings?.account_name ||
    paymentSettings?.account_number;
  const hasCompanyFooter =
    paymentSettings?.primary_phone ||
    paymentSettings?.secondary_phone ||
    instagram ||
    paymentSettings?.company_address;
  const balancePaid = invoice.balance_due <= 0;

  return (
    <div
      id={printId}
      className={cn(
        "relative mx-auto w-[210mm] min-w-[210mm] bg-white text-[#1a1a1a]",
        "shadow-[var(--shadow-card)] print:min-w-0 print:shadow-none",
        className,
      )}
    >
      {isVoided ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
        >
          <span className="rotate-[-24deg] text-[72pt] font-bold uppercase tracking-[0.2em] text-[#dc2626]/15">
            Voided
          </span>
        </div>
      ) : null}

      <div className="px-[20mm] py-[18mm] print:px-[20mm] print:py-[18mm]">
        <header className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/furniture-quotation-logo.png"
            alt="Remarkable Furniture"
            className="mx-auto h-[22mm] w-auto max-w-[34mm] object-contain object-center print:h-[22mm] print:max-w-[34mm]"
          />
          <p className="mt-[4mm] font-[family-name:var(--font-serif)] text-[11pt] font-semibold tracking-[0.12em] text-[#1a1a1a]">
            REMARKABLE FURNITURE
          </p>
          <h1 className="mt-[3mm] font-[family-name:var(--font-serif)] text-[16pt] font-bold tracking-[0.06em] text-[#1a1a1a]">
            INVOICE
          </h1>
          <p className="mt-1 text-[9pt] leading-relaxed text-[#666666]">
            <span className="font-semibold text-[#1a1a1a]">{invoice.invoice_number}</span>
            <br />
            Issue Date: {issuedLabel}
          </p>
        </header>

        <div className="mt-[5mm]">
          <SectionRule />
        </div>

        <section className="mt-[7mm] grid grid-cols-3 gap-x-6 gap-y-4">
          <div>
            <SectionLabel>Customer Information</SectionLabel>
            <p className="mt-1 text-[9.5pt] font-semibold leading-snug">{invoice.customer_name}</p>
            <p className="mt-1 text-[9.5pt] leading-snug text-[#555555]">
              {invoice.customer_address || "—"}
            </p>
            <p className="mt-1 text-[9.5pt] leading-snug">{invoice.customer_phone}</p>
            {invoice.customer_email ? (
              <p className="mt-0.5 text-[9.5pt] leading-snug text-[#555555]">
                {invoice.customer_email}
              </p>
            ) : null}
          </div>
          <div>
            <SectionLabel>Invoice Information</SectionLabel>
            <p className="mt-1 text-[9.5pt] leading-snug">Due Date: {dueLabel}</p>
            {invoice.source_quotation_number ? (
              <p className="mt-1 text-[9.5pt] leading-snug text-[#555555]">
                Quote: {invoice.source_quotation_number}
              </p>
            ) : null}
            {invoice.source_order_number ? (
              <p className="mt-1 text-[9.5pt] leading-snug text-[#555555]">
                Order: {invoice.source_order_number}
              </p>
            ) : null}
            {invoice.sales_representative ? (
              <p className="mt-1 text-[9.5pt] leading-snug text-[#555555]">
                Sales Rep: {invoice.sales_representative}
              </p>
            ) : null}
          </div>
          <div>
            <SectionLabel>Status</SectionLabel>
            <div className="mt-2">
              <FurnitureInvoiceStatusBadge status={invoice.status} />
            </div>
          </div>
        </section>

        <section className="mt-[8mm]">
          <table className="w-full border-collapse text-[9pt]">
            <thead>
              <tr className="border border-[#dddddd] bg-[#f5f5f5] text-left text-[7.5pt] uppercase tracking-[0.12em] text-[#666666]">
                <th className="px-2 py-2 font-semibold">Item</th>
                <th className="px-2 py-2 font-semibold">Description</th>
                <th className="px-2 py-2 text-center font-semibold">Qty</th>
                <th className="px-2 py-2 text-right font-semibold">Unit Price</th>
                <th className="px-2 py-2 text-right font-semibold">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr
                  key={item.id}
                  className={cn(
                    "border-x border-b border-[#dddddd]",
                    index % 2 === 1 && "bg-[#fafafa]",
                  )}
                >
                  <td className="px-2 py-2 align-top font-semibold">{item.name}</td>
                  <td className="px-2 py-2 align-top text-[#555555]">
                    {item.description || "—"}
                  </td>
                  <td className="px-2 py-2 text-center align-top">{item.quantity}</td>
                  <td className="px-2 py-2 text-right align-top">{formatNaira(item.unit_price)}</td>
                  <td className="px-2 py-2 text-right align-top font-semibold">
                    {formatNaira(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-[6mm] flex justify-end">
          <div className="w-[52mm] min-w-[180px] space-y-1.5 text-[9pt]">
            <div className="flex justify-between gap-4">
              <span className="text-[#666666]">Subtotal</span>
              <span>{formatNaira(invoice.subtotal)}</span>
            </div>
            {invoice.discount > 0 ? (
              <div className="flex justify-between gap-4">
                <span className="text-[#666666]">Discount</span>
                <span>-{formatNaira(invoice.discount)}</span>
              </div>
            ) : null}
            {invoice.additional_charges > 0 ? (
              <div className="flex justify-between gap-4">
                <span className="text-[#666666]">Additional Charges</span>
                <span>{formatNaira(invoice.additional_charges)}</span>
              </div>
            ) : null}
            {invoice.tax > 0 ? (
              <div className="flex justify-between gap-4">
                <span className="text-[#666666]">Tax</span>
                <span>{formatNaira(invoice.tax)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-[#1a1a1a] pt-2 text-[12pt] font-bold">
              <span>Grand Total</span>
              <span className="font-[family-name:var(--font-serif)]">
                {formatNaira(invoice.grand_total)}
              </span>
            </div>
            {invoice.amount_paid > 0 ? (
              <div className="flex justify-between gap-4 text-emerald-700">
                <span>Advance Payment</span>
                <span className="font-semibold">{formatNaira(invoice.amount_paid)}</span>
              </div>
            ) : null}
            <div
              className={cn(
                "flex justify-between gap-4 font-semibold",
                balancePaid ? "text-[#1a1a1a]" : "text-rose-700",
              )}
            >
              <span>Balance Due</span>
              <span>{formatNaira(invoice.balance_due)}</span>
            </div>
          </div>
        </section>

        {invoice.payments.length > 0 ? (
          <section className="mt-[10mm]">
            <SectionRule />
            <div className="mt-[5mm]">
              <SectionLabel>Payment History</SectionLabel>
              <table className="mt-3 w-full border-collapse text-[8.5pt]">
                <thead>
                  <tr className="border border-[#dddddd] bg-[#f5f5f5] text-left text-[7pt] uppercase tracking-[0.1em] text-[#666666]">
                    <th className="px-2 py-2 font-semibold">Date</th>
                    <th className="px-2 py-2 font-semibold">Description</th>
                    <th className="px-2 py-2 font-semibold">Method</th>
                    <th className="px-2 py-2 font-semibold">Reference</th>
                    <th className="px-2 py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((payment, index) => (
                    <tr
                      key={payment.id}
                      className={cn(
                        "border-x border-b border-[#dddddd]",
                        index % 2 === 1 && "bg-[#fafafa]",
                      )}
                    >
                      <td className="px-2 py-2 align-top">
                        {formatCatalogDate(payment.payment_date) ?? payment.payment_date}
                      </td>
                      <td className="px-2 py-2 align-top">{payment.description}</td>
                      <td className="px-2 py-2 align-top">{payment.method}</td>
                      <td className="px-2 py-2 align-top text-[#555555]">
                        {payment.reference || "—"}
                      </td>
                      <td className="px-2 py-2 text-right align-top font-semibold">
                        {formatNaira(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {hasPayment ? (
          <section className="mt-[10mm]">
            <SectionRule />
            <div className="mt-[5mm]">
              <SectionLabel>Payment Details</SectionLabel>
              <div className="mt-2 space-y-1 text-[9.5pt] leading-snug text-[#333333]">
                {paymentSettings?.bank_name ? <p>Bank: {paymentSettings.bank_name}</p> : null}
                {paymentSettings?.account_name ? (
                  <p>Account Name: {paymentSettings.account_name}</p>
                ) : null}
                {paymentSettings?.account_number ? (
                  <p>Account Number: {paymentSettings.account_number}</p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {(invoice.payment_terms || paymentSettings?.terms_text) ? (
          <section className="mt-[8mm]">
            <SectionRule />
            <div className="mt-[5mm]">
              <SectionLabel>Terms &amp; Conditions</SectionLabel>
              <p className="mt-2 whitespace-pre-wrap text-[8.5pt] leading-relaxed text-[#444444]">
                {invoice.payment_terms || paymentSettings?.terms_text}
              </p>
            </div>
          </section>
        ) : null}

        {hasCompanyFooter ? (
          <footer className="mt-[10mm] border-t border-[#e5e5e5] pt-[5mm] text-center text-[8pt] leading-relaxed text-[#666666]">
            {[
              paymentSettings?.primary_phone,
              paymentSettings?.secondary_phone,
              instagram,
              paymentSettings?.company_address,
            ]
              .filter(Boolean)
              .join("  |  ")}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
