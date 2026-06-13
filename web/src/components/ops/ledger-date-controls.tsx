"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBusinessDayLabel, isoDateDaysAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export function LedgerDateControls({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterday = React.useMemo(() => isoDateDaysAgo(1), []);

  const isToday = value === today;
  const isYesterday = value === yesterday;

  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <Button
        type="button"
        size="sm"
        variant={isToday ? "default" : "outline"}
        className={cn(
          "rounded-full",
          isToday && "border-transparent bg-[var(--foreground)] text-[var(--background)]",
        )}
        disabled={disabled}
        onClick={() => onChange(today)}
      >
        Today
      </Button>
      <Button
        type="button"
        size="sm"
        variant={isYesterday ? "default" : "outline"}
        className={cn(
          "rounded-full",
          isYesterday && "border-transparent bg-[var(--foreground)] text-[var(--background)]",
        )}
        disabled={disabled}
        onClick={() => onChange(yesterday)}
      >
        Yesterday
      </Button>
      <div className="space-y-1.5">
        <Label htmlFor="ledger-select-date" className="text-xs">
          Select date
        </Label>
        <div className="relative">
          <CalendarDays
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]"
            aria-hidden
          />
          <Input
            id="ledger-select-date"
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-44 pl-8"
            disabled={disabled}
            title={formatBusinessDayLabel(value)}
          />
        </div>
      </div>
    </div>
  );
}
