export function furnitureQuotationTaxPercentFromAmount(subtotal: number, taxAmount: number) {
  if (taxAmount <= 0 || subtotal <= 0) {
    return "";
  }
  const percent = (taxAmount / subtotal) * 100;
  const rounded = Math.round(percent * 100) / 100;
  return String(rounded);
}

export function furnitureQuotationTotals({
  subtotal,
  discountInput,
  taxPercentInput,
}: {
  subtotal: number;
  discountInput: string;
  taxPercentInput: string;
}) {
  const discountValue = discountInput.trim() ? Math.max(0, Number(discountInput) || 0) : 0;
  const taxPercent = taxPercentInput.trim() ? Math.max(0, Number(taxPercentInput) || 0) : 0;
  const taxAmount = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
  const grandTotal = Math.max(0, Math.round((subtotal - discountValue + taxAmount) * 100) / 100);

  return {
    discountValue,
    taxPercent,
    taxAmount,
    grandTotal,
  };
}
