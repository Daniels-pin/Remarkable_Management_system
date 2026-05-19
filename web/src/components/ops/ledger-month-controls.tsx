"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  monthDisplayLabel,
  quickMonthPresets,
  yearMonthEquals,
  yearMonthKey,
  type YearMonth,
} from "@/lib/ledger-month";
import { cn } from "@/lib/utils";

export type OperationalMonthOption = YearMonth & {
  state?: string;
  is_current?: boolean;
};

export const OPERATIONAL_HISTORY_PAGE_SIZE = 15;

export function LedgerMonthControls({
  selected,
  onSelect,
  archiveMonths = [],
  className,
}: {
  selected: YearMonth;
  onSelect: (value: YearMonth) => void;
  archiveMonths?: OperationalMonthOption[];
  className?: string;
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const presets = React.useMemo(() => quickMonthPresets(), []);

  const archiveSorted = React.useMemo(
    () =>
      [...archiveMonths].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      }),
    [archiveMonths],
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => {
          const active = yearMonthEquals(selected, preset.value);
          return (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className={
                active
                  ? "rounded-full border-transparent bg-[var(--foreground)] text-[var(--background)]"
                  : "rounded-full border-dashed"
              }
              onClick={() => onSelect(preset.value)}
            >
              {preset.label}
            </Button>
          );
        })}
        <span className="hidden h-4 w-px bg-[var(--border)] sm:inline-block" aria-hidden />
        <span className="text-xs text-[var(--muted-foreground)] sm:ml-1">
          {monthDisplayLabel(selected)}
        </span>
      </div>

      <div className="flex justify-center pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          onClick={() => setPickerOpen(true)}
        >
          <CalendarDays className="mr-2 size-3.5 opacity-70" aria-hidden />
          Choose a month
        </Button>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-serif)]">Operational archive</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">
              Browse indexed service and reconciliation history by calendar month.
            </p>
            {archiveSorted.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                No historical months recorded yet.
              </p>
            ) : (
              <ul className="max-h-[min(24rem,50vh)] space-y-1 overflow-y-auto pr-1">
                {archiveSorted.map((m) => {
                  const active = yearMonthEquals(selected, m);
                  return (
                    <li key={yearMonthKey(m)}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm transition-colors",
                          active
                            ? "bg-[var(--foreground)] text-[var(--background)]"
                            : "hover:bg-[var(--muted)]/50",
                        )}
                        onClick={() => {
                          onSelect({ year: m.year, month: m.month });
                          setPickerOpen(false);
                        }}
                      >
                        <span className="font-medium">{monthDisplayLabel(m)}</span>
                        {m.is_current ? (
                          <span
                            className={cn(
                              "text-[10px] font-medium uppercase tracking-wider",
                              active ? "text-[var(--background)]/80" : "text-[var(--muted-foreground)]",
                            )}
                          >
                            Current
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
