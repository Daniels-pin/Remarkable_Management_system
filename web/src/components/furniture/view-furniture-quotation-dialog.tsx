"use client";

import { Download, Printer } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { FurnitureQuotationDocument } from "@/components/furniture/furniture-quotation-document";
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
  downloadFurnitureQuotationPdf,
  getFurnitureQuotationPaymentSettings,
  type FurnitureQuotation,
  type FurnitureQuotationPaymentSettings,
} from "@/lib/api";

function QuotationPreviewFrame({ children }: { children: React.ReactNode }) {
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

export function ViewFurnitureQuotationDialog({
  quotation,
  open,
  onOpenChange,
}: {
  quotation: FurnitureQuotation | null;
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

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    if (!quotation) return;
    setDownloading(true);
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
      setDownloading(false);
    }
  };

  if (!quotation) return null;

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #furniture-quotation-print-root,
          #furniture-quotation-print-root * {
            visibility: visible !important;
          }
          #furniture-quotation-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            transform: none !important;
            margin: 0 !important;
          }
        }
      `}</style>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(100%,56rem)] max-w-none p-0">
          <DialogHeader className="border-b border-[var(--border)] px-6 py-4 print:hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <DialogTitle>Quotation {quotation.quotation_number}</DialogTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDownload()}
                  disabled={downloading}
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  {downloading ? "Downloading…" : "Download PDF"}
                </Button>
                <Button type="button" size="sm" className="rounded-full" onClick={handlePrint}>
                  <Printer className="mr-1.5 h-4 w-4" />
                  Print
                </Button>
              </div>
            </div>
          </DialogHeader>
          <DialogBody className="bg-[#ececec] p-4 sm:p-6 print:bg-white print:p-0">
            <QuotationPreviewFrame>
              <div id="furniture-quotation-print-root">
                <FurnitureQuotationDocument
                  quotation={quotation}
                  paymentSettings={paymentSettings}
                />
              </div>
            </QuotationPreviewFrame>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
