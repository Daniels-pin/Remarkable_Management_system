/** Cross-view refresh when attendance penalties change payroll totals. */

export const PAYOUT_UPDATED_EVENT = "rms:payout-updated";

export type PayoutUpdatedDetail = {
  expectedPayout?: number;
  actualPayout?: number;
  attendanceDeductionsTotal?: number;
};

export function dispatchPayoutUpdated(detail?: PayoutUpdatedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAYOUT_UPDATED_EVENT, { detail }));
}

export function subscribePayoutUpdated(handler: (detail?: PayoutUpdatedDetail) => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    const custom = event as CustomEvent<PayoutUpdatedDetail | undefined>;
    handler(custom.detail);
  };
  window.addEventListener(PAYOUT_UPDATED_EVENT, listener);
  return () => window.removeEventListener(PAYOUT_UPDATED_EVENT, listener);
}
