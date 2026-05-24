"use client";

import * as React from "react";

import { Input, type InputProps } from "@/components/ui/input";

type FurnitureOperationalNumericInputProps = Omit<InputProps, "type" | "value" | "onChange"> & {
  value: number;
  defaultValue: number;
  onValueChange: (value: number) => void;
};

function parseNumericInput(raw: string) {
  if (raw.trim() === "") {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampValue(value: number, min?: number | string) {
  if (min === undefined) {
    return value;
  }
  const minNum = typeof min === "number" ? min : Number(min);
  if (!Number.isFinite(minNum)) {
    return value;
  }
  return Math.max(minNum, value);
}

export function FurnitureOperationalNumericInput({
  value,
  defaultValue,
  onValueChange,
  min,
  onFocus,
  onBlur,
  ...props
}: FurnitureOperationalNumericInputProps) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const isEditing = draft !== null;

  const displayValue = isEditing
    ? draft
    : value === defaultValue
      ? ""
      : String(value);

  const commitValue = React.useCallback(
    (raw: string) => {
      const parsed = parseNumericInput(raw);
      if (parsed === null) {
        onValueChange(defaultValue);
        return;
      }
      onValueChange(clampValue(parsed, min));
    },
    [defaultValue, min, onValueChange],
  );

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    if (value === defaultValue) {
      setDraft("");
    } else {
      setDraft(String(value));
      requestAnimationFrame(() => event.target.select());
    }
    onFocus?.(event);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setDraft(next);

    const parsed = parseNumericInput(next);
    if (parsed !== null) {
      onValueChange(clampValue(parsed, min));
    } else if (next.trim() === "") {
      onValueChange(defaultValue);
    }
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    commitValue(draft ?? (value === defaultValue ? "" : String(value)));
    setDraft(null);
    onBlur?.(event);
  };

  return (
    <Input
      {...props}
      type="number"
      min={min}
      value={displayValue}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
