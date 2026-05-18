"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CatalogDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  entityLabel: string;
  onConfirm: () => void;
  confirming?: boolean;
};

export function CatalogDeleteDialog({
  open,
  onOpenChange,
  itemName,
  entityLabel,
  onConfirm,
  confirming = false,
}: CatalogDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,24rem)]">
        <DialogHeader>
          <DialogTitle>Remove {entityLabel}?</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
            <span className="font-medium text-[var(--foreground)]">{itemName}</span> will be
            archived and hidden from new entries. Historical ledger records keep the original
            name.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
              disabled={confirming}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full bg-red-600 text-white hover:bg-red-600/90"
              onClick={onConfirm}
              disabled={confirming}
            >
              {confirming ? "Removing…" : "Remove"}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
