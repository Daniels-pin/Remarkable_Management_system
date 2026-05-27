"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FurnitureOperationalNumericInput } from "@/components/furniture/furniture-operational-numeric-input";
import { formatNaira } from "@/lib/format";
import {
  emptyQuotationItemRow,
  quotationItemLineTotal,
  type FurnitureQuotationItemRow,
  type FurnitureQuotationSectionRow,
} from "@/lib/furniture-quotation-sections";

function QuotationItemEditor({
  row,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  row: FurnitureQuotationItemRow;
  index: number;
  canRemove: boolean;
  onChange: (patch: Partial<FurnitureQuotationItemRow>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">Item {index + 1}</span>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[var(--muted-foreground)]"
            onClick={onRemove}
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Item name</Label>
          <Input
            value={row.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Custom dining table"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Description</Label>
          <Input
            value={row.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Materials, dimensions, finish…"
          />
        </div>
        <div className="space-y-2">
          <Label>Quantity</Label>
          <FurnitureOperationalNumericInput
            min={0}
            integerOnly
            value={row.quantity}
            defaultValue={0}
            onValueChange={(quantity) => onChange({ quantity })}
          />
        </div>
        <div className="space-y-2">
          <Label>Unit price</Label>
          <FurnitureOperationalNumericInput
            min={0}
            value={row.unit_price}
            defaultValue={0}
            onValueChange={(unit_price) => onChange({ unit_price })}
          />
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-[var(--muted-foreground)]">
            Line total:{" "}
            <span className="font-medium text-[var(--foreground)]">
              {formatNaira(quotationItemLineTotal(row))}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export function FurnitureQuotationSectionEditor({
  sections,
  onChange,
}: {
  sections: FurnitureQuotationSectionRow[];
  onChange: (sections: FurnitureQuotationSectionRow[]) => void;
}) {
  const updateSections = (next: FurnitureQuotationSectionRow[]) => onChange(next);

  const updateSection = (sectionKey: string, patch: Partial<FurnitureQuotationSectionRow>) => {
    updateSections(sections.map((section) => (section.key === sectionKey ? { ...section, ...patch } : section)));
  };

  const removeSection = (sectionKey: string) => {
    if (sections.length <= 1) return;
    updateSections(sections.filter((section) => section.key !== sectionKey));
  };

  const addSection = () => {
    updateSections([...sections, { key: crypto.randomUUID(), title: "", items: [emptyQuotationItemRow()] }]);
  };

  const addItem = (sectionKey: string) => {
    updateSections(
      sections.map((section) =>
        section.key === sectionKey
          ? { ...section, items: [...section.items, emptyQuotationItemRow()] }
          : section,
      ),
    );
  };

  const updateItem = (sectionKey: string, itemKey: string, patch: Partial<FurnitureQuotationItemRow>) => {
    updateSections(
      sections.map((section) =>
        section.key === sectionKey
          ? {
              ...section,
              items: section.items.map((item) =>
                item.key === itemKey ? { ...item, ...patch } : item,
              ),
            }
          : section,
      ),
    );
  };

  const removeItem = (sectionKey: string, itemKey: string) => {
    updateSections(
      sections.map((section) => {
        if (section.key !== sectionKey) return section;
        if (section.items.length <= 1) return section;
        return {
          ...section,
          items: section.items.filter((item) => item.key !== itemKey),
        };
      }),
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Quotation sections
        </p>
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={addSection}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add subheading
        </Button>
      </div>

      <div className="space-y-5">
        {sections.map((section, sectionIndex) => (
          <div
            key={section.key}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/15 p-4"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor={`section-title-${section.key}`}>Section subheading</Label>
                <Input
                  id={`section-title-${section.key}`}
                  value={section.title}
                  onChange={(e) => updateSection(section.key, { title: e.target.value })}
                  placeholder="e.g. Master bedroom"
                  className="border-[var(--border)] bg-[var(--card)] text-base font-semibold"
                />
              </div>
              {sections.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-7 h-8 w-8 shrink-0 text-[var(--muted-foreground)]"
                  onClick={() => removeSection(section.key)}
                  aria-label={`Remove section ${sectionIndex + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            <div className="space-y-3">
              {section.items.map((row, index) => (
                <QuotationItemEditor
                  key={row.key}
                  row={row}
                  index={index}
                  canRemove={section.items.length > 1}
                  onChange={(patch) => updateItem(section.key, row.key, patch)}
                  onRemove={() => removeItem(section.key, row.key)}
                />
              ))}
            </div>

            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => addItem(section.key)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add item to this section
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
