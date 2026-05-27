"use client";

import * as React from "react";

import { Input, type InputProps } from "@/components/ui/input";

type FurnitureOperationalAmountInputProps = Omit<InputProps, "type" | "value" | "onChange" | "step" | "min" | "max"> & {
  value: string;
  onValueChange: (value: string) => void;
};

function sanitizeAmountDraft(raw: string) {
  let cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) {
    cleaned = `${parts[0]}.${parts.slice(1).join("")}`;
  }
  return cleaned;
}

export function FurnitureOperationalAmountInput({
  value,
  onValueChange,
  ...props
}: FurnitureOperationalAmountInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(event) => onValueChange(sanitizeAmountDraft(event.target.value))}
    />
  );
}
