"use client";

import * as React from "react";

import type { FurnitureQuotation, FurnitureQuotationPaymentSettings } from "@/lib/api";
import { formatCatalogDate, formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

function instagramDisplay(handle: string | null | undefined) {
  if (!handle?.trim()) return null;
  const cleaned = handle.trim().replace(/^@/, "");
  return cleaned ? `@${cleaned}` : null;
}

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

export function FurnitureQuotationDocument({
  quotation,
  paymentSettings,
  className,
  printId = "furniture-quotation-document",
}: {
  quotation: FurnitureQuotation;
  paymentSettings: FurnitureQuotationPaymentSettings | null;
  className?: string;
  printId?: string;
}) {
  const hasPayment =
    paymentSettings?.bank_name ||
    paymentSettings?.account_name ||
    paymentSettings?.account_number;

  const instagram = instagramDisplay(paymentSettings?.instagram_handle);
  const hasCompanyFooter =
    paymentSettings?.primary_phone ||
    paymentSettings?.secondary_phone ||
    instagram ||
    paymentSettings?.company_address;

  const issuedLabel = formatCatalogDate(quotation.date_issued) ?? quotation.date_issued;

  return (
    <div
      id={printId}
      className={cn(
        "mx-auto w-[210mm] min-w-[210mm] bg-white text-[#1a1a1a]",
        "shadow-[var(--shadow-card)] print:min-w-0 print:shadow-none",
        className,
      )}
    >
      <div className="px-[20mm] py-[18mm] print:px-[20mm] print:py-[18mm]">
        {/* Header */}
        <header className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/furniture-quotation-logo.png"
            alt="Remarkable Furniture"
            className="mx-auto h-[22mm] w-auto max-w-[34mm] object-contain object-center print:h-[22mm] print:max-w-[34mm]"
          />
          <h1 className="mt-[5mm] font-[family-name:var(--font-serif)] text-[13pt] font-semibold tracking-[0.08em] text-[#1a1a1a]">
            QUOTATION
          </h1>
          <p className="mt-1 text-[9pt] leading-relaxed text-[#666666]">
            <span className="font-semibold text-[#1a1a1a]">{quotation.quotation_number}</span>
            <br />
            Issued {issuedLabel}
          </p>
        </header>

        <div className="mt-[5mm]">
          <SectionRule />
        </div>

        {/* Customer */}
        <section className="mt-[7mm] grid grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <SectionLabel>Customer</SectionLabel>
            <p className="mt-1 text-[9.5pt] font-semibold leading-snug">{quotation.customer_name}</p>
            <p className="mt-1 text-[9.5pt] leading-snug text-[#555555]">
              {quotation.customer_address || "—"}
            </p>
          </div>
          <div>
            <SectionLabel>Contact</SectionLabel>
            <p className="mt-1 text-[9.5pt] leading-snug">{quotation.customer_phone}</p>
            <p className="mt-1 text-[9.5pt] leading-snug text-[#555555]">Date issued: {issuedLabel}</p>
          </div>
        </section>

        {/* Items */}
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
              {quotation.items.map((item, index) => (
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

        {/* Totals */}
        <section className="mt-[6mm] flex justify-end">
          <div className="w-[42mm] min-w-[160px] space-y-1.5 text-[9pt]">
            <div className="flex justify-between gap-4">
              <span className="text-[#666666]">Subtotal</span>
              <span>{formatNaira(quotation.subtotal)}</span>
            </div>
            {quotation.discount > 0 ? (
              <div className="flex justify-between gap-4">
                <span className="text-[#666666]">Discount</span>
                <span>-{formatNaira(quotation.discount)}</span>
              </div>
            ) : null}
            {quotation.tax > 0 ? (
              <div className="flex justify-between gap-4">
                <span className="text-[#666666]">Tax</span>
                <span>{formatNaira(quotation.tax)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-[#1a1a1a] pt-2 text-[11pt] font-semibold">
              <span>Grand Total</span>
              <span className="font-[family-name:var(--font-serif)]">
                {formatNaira(quotation.grand_total)}
              </span>
            </div>
          </div>
        </section>

        {/* Payment details */}
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

        {/* Terms */}
        {paymentSettings?.terms_text ? (
          <section className={cn("mt-[6mm]", !hasPayment && "mt-[10mm]")}>
            <SectionRule />
            <div className="mt-[5mm]">
              <SectionLabel>Terms &amp; Conditions</SectionLabel>
              <p className="mt-2 whitespace-pre-wrap text-[8.5pt] leading-[1.45] text-[#444444]">
                {paymentSettings.terms_text}
              </p>
            </div>
          </section>
        ) : null}

        {/* Company footer */}
        {hasCompanyFooter ? (
          <footer className="mt-[8mm]">
            <SectionRule />
            <div className="mt-[6mm] space-y-1.5 text-center text-[8pt] leading-[1.5] text-[#666666]">
              {paymentSettings?.primary_phone || paymentSettings?.secondary_phone ? (
                <p>
                  {[paymentSettings.primary_phone, paymentSettings.secondary_phone]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              {instagram ? <p>{instagram}</p> : null}
              {paymentSettings?.company_address ? (
                <p className="mx-auto max-w-[140mm]">{paymentSettings.company_address}</p>
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
