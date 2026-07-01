"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type MetricTone = "default" | "positive" | "negative" | "muted";

const toneText: Record<MetricTone, string> = {
  default: "text-[var(--foreground)]",
  positive: "text-emerald-700 dark:text-emerald-300",
  negative: "text-rose-700 dark:text-rose-300",
  muted: "text-[var(--muted-foreground)]",
};

export function SummaryMetricCard({
  label,
  value,
  hint,
  tone = "default",
  className,
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: MetricTone;
  className?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-3 rounded-[var(--radius-lg)] border bg-[var(--card)] p-5 text-left shadow-[var(--shadow-card)] transition-[border-color,box-shadow,transform]",
        active
          ? "border-[var(--foreground)]/25 ring-1 ring-[var(--foreground)]/10 shadow-[var(--shadow-elevated)]"
          : "border-[var(--border)]",
        onClick && !active && "hover:border-[var(--foreground)]/15 hover:shadow-[var(--shadow-elevated)]",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p
        className={cn(
          "font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight md:text-[1.65rem]",
          toneText[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{hint}</p>
      ) : (
        <div className="h-4" />
      )}
    </Comp>
  );
}
