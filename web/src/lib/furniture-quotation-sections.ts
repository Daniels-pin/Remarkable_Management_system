import type { FurnitureOrderItemInput, FurnitureQuotationSection } from "@/lib/api";

export type FurnitureQuotationItemRow = FurnitureOrderItemInput & { key: string };

export type FurnitureQuotationSectionRow = {
  key: string;
  title: string;
  items: FurnitureQuotationItemRow[];
};

export function emptyQuotationItemRow(): FurnitureQuotationItemRow {
  return {
    key: crypto.randomUUID(),
    name: "",
    description: "",
    quantity: 0,
    unit_price: 0,
  };
}

export function emptyQuotationSectionRow(): FurnitureQuotationSectionRow {
  return {
    key: crypto.randomUUID(),
    title: "",
    items: [emptyQuotationItemRow()],
  };
}

export function quotationItemLineTotal(row: FurnitureQuotationItemRow) {
  const qty = Math.max(0, Number(row.quantity) || 0);
  const price = Math.max(0, Number(row.unit_price) || 0);
  return qty * price;
}

export function quotationSectionsSubtotal(sections: FurnitureQuotationSectionRow[]) {
  return sections.reduce(
    (sum, section) =>
      sum + section.items.reduce((sectionSum, row) => sectionSum + quotationItemLineTotal(row), 0),
    0,
  );
}

export function quotationSectionsFromApi(sections: FurnitureQuotationSection[]): FurnitureQuotationSectionRow[] {
  if (sections.length === 0) {
    return [emptyQuotationSectionRow()];
  }

  return sections.map((section) => ({
    key: section.id,
    title: section.title,
    items:
      section.items.length > 0
        ? section.items.map((item) => ({
            key: item.id,
            name: item.name,
            description: item.description ?? "",
            quantity: item.quantity,
            unit_price: item.unit_price,
          }))
        : [emptyQuotationItemRow()],
  }));
}

export function buildQuotationSectionsPayload(sections: FurnitureQuotationSectionRow[]) {
  return sections
    .map((section) => ({
      title: section.title.trim(),
      items: section.items
        .filter((row) => row.name.trim())
        .map(({ name, description, quantity, unit_price }) => ({
          name: name.trim(),
          description: description?.trim() || null,
          quantity,
          unit_price,
        })),
    }))
    .filter((section) => section.title && section.items.length > 0);
}

export function buildQuotationSectionsAutosavePayload(sections: FurnitureQuotationSectionRow[]) {
  const payload = sections.map((section) => ({
    title: section.title.trim(),
    items: section.items
      .filter((row) => row.name.trim() || (row.description?.trim() ?? "") || row.quantity > 0 || row.unit_price > 0)
      .map(({ name, description, quantity, unit_price }) => ({
        name: name.trim(),
        description: description?.trim() || null,
        quantity,
        unit_price,
      })),
  }));

  if (payload.length === 0) {
    return [{ title: "", items: [] }];
  }

  return payload;
}
