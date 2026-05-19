const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export function formatNaira(amount: number) {
  return naira.format(amount);
}

export function formatCompactNaira(amount: number) {
  if (Math.abs(amount) >= 1_000_000) {
    return `₦${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1000) {
    return `₦${(amount / 1000).toFixed(1)}k`;
  }
  return formatNaira(amount);
}

export function formatServicesCount(count: number) {
  const n = Math.max(0, Math.round(count));
  if (n === 1) return "1 service";
  return `${n.toLocaleString("en-NG")} services`;
}

export function formatTimeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact HH:mm for dense operational tables. */
export function formatTimeShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Short date for catalog management rows (e.g. 12 May 2026). */
export function formatCatalogDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
