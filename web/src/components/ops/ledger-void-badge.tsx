"use client";

import { cn } from "@/lib/utils";

export type LedgerVoidMeta = {
  isVoided?: boolean;
  voidReason?: string | null;
  voidedByLabel?: string | null;
  voidedAt?: string | null;
  pendingVoidReason?: string | null;
  pendingVoidByLabel?: string | null;
};

export function LedgerVoidBadge({
  meta,
  compact = false,
  className,
}: {
  meta: LedgerVoidMeta;
  compact?: boolean;
  className?: string;
}) {
  if (meta.isVoided) {
    return (
      <span
        className={cn(
          "inline-flex flex-col gap-0.5 rounded-md border border-[var(--border)]/60 bg-[var(--muted)]/30 text-[var(--muted-foreground)]",
          compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]",
          className,
        )}
      >
        <span className="font-semibold uppercase tracking-wider text-red-600/90 dark:text-red-400">
          Voided
        </span>
        {!compact && meta.voidedByLabel ? (
          <span>
            by {meta.voidedByLabel}
            {meta.voidReason ? (
              <>
                {" "}
                · Reason: <span className="text-[var(--foreground)]">{meta.voidReason}</span>
              </>
            ) : null}
          </span>
        ) : null}
        {compact && meta.voidReason ? (
          <span className="truncate max-w-[8rem]">{meta.voidReason}</span>
        ) : null}
      </span>
    );
  }

  if (meta.pendingVoidReason) {
    return (
      <span
        className={cn(
          "inline-flex flex-col gap-0.5 rounded-md border border-amber-500/30 bg-amber-500/[0.08] text-amber-900 dark:text-amber-200",
          compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]",
          className,
        )}
      >
        <span className="font-semibold uppercase tracking-wider">Pending void</span>
        {!compact ? (
          <span>
            {meta.pendingVoidByLabel ? `Requested by ${meta.pendingVoidByLabel}` : "Awaiting your review"}
            {" · "}
            {meta.pendingVoidReason}
          </span>
        ) : null}
      </span>
    );
  }

  return null;
}
