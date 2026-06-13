"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const SERVICE_PAYMENT_OPTIONS = [
  { value: "cash" as const, label: "Cash" },
  { value: "transfer" as const, label: "Transfer" },
  { value: "pos" as const, label: "POS" },
];

export type ServicePaymentMethod = (typeof SERVICE_PAYMENT_OPTIONS)[number]["value"];

export function formatServicePaymentMethod(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = SERVICE_PAYMENT_OPTIONS.find((opt) => opt.value === raw);
  return match?.label ?? raw.replace(/_/g, " ");
}

export function ServicePaymentMethodSelect({
  value,
  onChange,
  exclude,
  className,
}: {
  value: ServicePaymentMethod;
  onChange: (v: ServicePaymentMethod) => void;
  exclude?: ServicePaymentMethod | null;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {SERVICE_PAYMENT_OPTIONS.filter((opt) => opt.value !== exclude).map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          variant={value === opt.value ? "default" : "outline"}
          className={cn(
            "rounded-full text-xs",
            value === opt.value
              ? "border-transparent bg-[var(--foreground)] text-[var(--background)]"
              : "border-dashed",
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
