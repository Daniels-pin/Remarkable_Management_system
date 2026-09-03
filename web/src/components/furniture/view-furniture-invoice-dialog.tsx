"use client";

import { Download, Printer, Share2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { FurnitureInvoiceDocument } from "@/components/furniture/furniture-invoice-document";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApiError,
  downloadFurnitureInvoicePdf,
  getFurnitureQuotationPaymentSettings,
  type FurnitureInvoice,
  type FurnitureQuotationPaymentSettings,
} from "@/lib/api";

function InvoicePreviewFrame({ children }: { children: React.ReactNode }) {
  const shellRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const updateScale = () => {
      const available = shell.clientWidth - 8;
      const docWidthPx = (210 / 25.4) * 96;
      setScale(Math.min(1, available / docWidthPx));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={shellRef} className="mx-auto w-full max-w-[210mm] overflow-x-auto overflow-y-visible">
      <div
        className="mx-auto origin-top"
        style={{
          width: "210mm",
          transform: scale < 1 ? `scale(${scale})` : undefined,
          marginBottom: scale < 1 ? `${(1 - scale) * -100}%` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ViewFurnitureInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: FurnitureInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [paymentSettings, setPaymentSettings] =
    React.useState<FurnitureQuotationPaymentSettings | null>(null);
  const [downloading, setDownloading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    void getFurnitureQuotationPaymentSettings()
      .then(setPaymentSettings)
      .catch(() => setPaymentSettings(null));
  }, [open]);

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
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
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!invoice) return;
    try {
      const blob = await downloadFurnitureInvoicePdf(invoice.id);
      const file = new File([blob], `${invoice.invoice_number}.pdf`, { type: "application/pdf" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Invoice ${invoice.invoice_number}`,
          files: [file],
        });
      } else {
        await handleDownload();
        toast.message("PDF downloaded — share the file from your device.");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof ApiError ? err.message : "Could not share invoice.";
      toast.error(msg);
    }
  };

  if (!invoice) return null;

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #furniture-invoice-print-root,
          #furniture-invoice-print-root * {
            visibility: visible !important;
          }
          #furniture-invoice-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            transform: none !important;
          }
        }
      `}</style>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[95vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{invoice.invoice_number}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void handleDownload()} disabled={downloading}>
                <Download className="mr-1.5 h-4 w-4" />
                Download PDF
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-1.5 h-4 w-4" />
                Print
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleShare()}>
                <Share2 className="mr-1.5 h-4 w-4" />
                Share
              </Button>
            </div>

            {(invoice.source_quotation_id || invoice.source_order_id) && (
              <div className="flex flex-wrap gap-3 text-sm text-[var(--muted-foreground)]">
                {invoice.source_quotation_id ? (
                  <span>
                    From quotation{" "}
                    <Link
                      href="/furniture/quotations"
                      className="font-medium text-[var(--foreground)] underline-offset-2 hover:underline"
                    >
                      {invoice.source_quotation_number}
                    </Link>
                  </span>
                ) : null}
                {invoice.source_order_id ? (
                  <span>
                    From order{" "}
                    <Link
                      href="/furniture/orders"
                      className="font-medium text-[var(--foreground)] underline-offset-2 hover:underline"
                    >
                      {invoice.source_order_number}
                    </Link>
                  </span>
                ) : null}
              </div>
            )}

            <div id="furniture-invoice-print-root">
              <InvoicePreviewFrame>
                <FurnitureInvoiceDocument
                  invoice={invoice}
                  paymentSettings={paymentSettings}
                  printId="furniture-invoice-document"
                />
              </InvoicePreviewFrame>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
