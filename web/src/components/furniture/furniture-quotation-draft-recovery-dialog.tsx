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
import {
  ApiError,
  discardFurnitureQuotationActiveAutosave,
  type FurnitureQuotation,
} from "@/lib/api";
import {
  clearFurnitureQuotationDraft,
  markFurnitureQuotationRecoveryShown,
  setFurnitureQuotationResumeId,
} from "@/lib/furniture-quotation-draft";
import { emitFurnitureResumeDraft } from "@/lib/furniture-events";
import { formatCatalogDate } from "@/lib/format";

export function FurnitureQuotationDraftRecoveryDialog({
  draft,
  open,
  onOpenChange,
  onContinue,
}: {
  draft: FurnitureQuotation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}) {
  const [discarding, setDiscarding] = React.useState(false);

  const handleDiscard = async () => {
    setDiscarding(true);
    try {
      await discardFurnitureQuotationActiveAutosave();
      clearFurnitureQuotationDraft();
      markFurnitureQuotationRecoveryShown();
      onOpenChange(false);
      toast.success("Draft discarded.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not discard draft.";
      toast.error(msg);
    } finally {
      setDiscarding(false);
    }
  };

  const handleContinue = () => {
    if (!draft) return;
    setFurnitureQuotationResumeId(draft.id);
    emitFurnitureResumeDraft(draft.id);
    markFurnitureQuotationRecoveryShown();
    onOpenChange(false);
    onContinue();
  };

  if (!draft) return null;

  const customerLabel =
    draft.customer_name === "Draft" && draft.customer_phone === "-"
      ? "Unnamed customer"
      : draft.customer_name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,28rem)] max-w-none">
        <DialogHeader>
          <DialogTitle>Unfinished quotation draft</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            You have an unfinished quotation draft. Would you like to continue editing it?
          </p>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4 text-sm">
            <p className="font-medium">{draft.quotation_number}</p>
            <p className="mt-1">{customerLabel}</p>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Last updated{" "}
              {formatCatalogDate(draft.updated_at.slice(0, 10)) ?? draft.updated_at.slice(0, 10)}
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={discarding}
              onClick={() => void handleDiscard()}
            >
              {discarding ? "Discarding…" : "Discard draft"}
            </Button>
            <Button type="button" className="rounded-full" onClick={handleContinue}>
              Continue draft
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
