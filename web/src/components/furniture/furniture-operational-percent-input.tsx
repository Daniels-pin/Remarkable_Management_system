"use client";

import * as React from "react";

import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FurnitureOperationalPercentInputProps = Omit<
  InputProps,
  "type" | "value" | "onChange" | "step" | "min" | "max"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

function sanitizePercentDraft(raw: string) {
  let cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) {
    cleaned = `${parts[0]}.${parts.slice(1).join("")}`;
  }
  return cleaned;
}

export function FurnitureOperationalPercentInput({
  value,
  onValueChange,
  className,
  ...props
}: FurnitureOperationalPercentInputProps) {
  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onValueChange(sanitizePercentDraft(event.target.value))}
        className={cn("pr-9", className)}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--muted-foreground)]/60"
      >
        %
      </span>
    </div>
  );
}
