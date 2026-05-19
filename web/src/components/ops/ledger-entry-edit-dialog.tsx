"use client";

import * as React from "react";

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
import { formatLedgerIndexLabel } from "@/lib/ledger-index";
import type { LedgerEntryType } from "@/lib/ops-types";

export type LedgerEditTarget = {
  id: string;
  index: number;
  indexLabel?: string;
  type: LedgerEntryType;
  description: string;
  amount: number;
  note?: string | null;
};

type LedgerEntryEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LedgerEditTarget | null;
  onSave: (data: { amount: number; note: string | null }) => Promise<void>;
};

export function LedgerEntryEditDialog({
  open,
  onOpenChange,
  target,
  onSave,
}: LedgerEntryEditDialogProps) {
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && target) {
      setAmount(String(target.amount));
      setNote(target.note ?? "");
      setSubmitting(false);
    }
  }, [open, target]);

  if (!target) return null;

  const parsed = Number(amount);
  const canSave = Number.isFinite(parsed) && parsed > 0 && !submitting;

  const handleSave = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      await onSave({ amount: parsed, note: note.trim() || null });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const indexDisplay = formatLedgerIndexLabel(
    target.type,
    target.index,
    target.indexLabel,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,24rem)]">
        <DialogHeader>
          <DialogTitle>Edit record</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            <span className="font-mono text-[11px]">{indexDisplay}</span>
            {" · "}
            <span className="text-[var(--foreground)]">{target.description}</span>
          </p>
          <AmountField amount={amount} onAmountChange={setAmount} />
          <NoteField note={note} onNoteChange={setNote} />
          <EditDialogActions
            submitting={submitting}
            canSave={canSave}
            onCancel={() => onOpenChange(false)}
            onSave={() => void handleSave()}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function AmountField({
  amount,
  onAmountChange,
}: {
  amount: string;
  onAmountChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="edit-amount">Amount (₦)</Label>
      <Input
        id="edit-amount"
        type="number"
        min={1}
        step="0.01"
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
      />
    </div>
  );
}

function NoteField({
  note,
  onNoteChange,
}: {
  note: string;
  onNoteChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="edit-note">Note</Label>
      <Input
        id="edit-note"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="Optional"
      />
    </div>
  );
}

function EditDialogActions({
  submitting,
  canSave,
  onCancel,
  onSave,
}: {
  submitting: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="outline"
        className="rounded-full"
        onClick={onCancel}
        disabled={submitting}
      >
        Cancel
      </Button>
      <Button
        type="button"
        className="rounded-full"
        onClick={onSave}
        disabled={!canSave}
      >
        {submitting ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
