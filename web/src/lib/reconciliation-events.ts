/** Cross-view refresh when reconciliation pending counts or inbox state changes. */

export const RECONCILIATION_UPDATED_EVENT = "rms:reconciliation-updated";

export type ReconciliationUpdatedDetail = {
  pending?: number;
  mismatch?: number;
};

export function dispatchReconciliationUpdated(detail?: ReconciliationUpdatedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RECONCILIATION_UPDATED_EVENT, { detail }));
}

export function subscribeReconciliationUpdated(
  handler: (detail?: ReconciliationUpdatedDetail) => void,
) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    const custom = event as CustomEvent<ReconciliationUpdatedDetail | undefined>;
    handler(custom.detail);
  };
  window.addEventListener(RECONCILIATION_UPDATED_EVENT, listener);
  return () => window.removeEventListener(RECONCILIATION_UPDATED_EVENT, listener);
}
