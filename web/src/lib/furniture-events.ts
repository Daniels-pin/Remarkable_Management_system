export const FURNITURE_UPDATED_EVENT = "remarkable:furniture-updated";
export const FURNITURE_RESUME_DRAFT_EVENT = "remarkable:furniture-resume-draft";

export function emitFurnitureUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FURNITURE_UPDATED_EVENT));
}

export function subscribeFurnitureUpdated(handler: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(FURNITURE_UPDATED_EVENT, handler);
  return () => window.removeEventListener(FURNITURE_UPDATED_EVENT, handler);
}

export function emitFurnitureResumeDraft(quotationId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FURNITURE_RESUME_DRAFT_EVENT, { detail: { quotationId } }),
  );
}

export function subscribeFurnitureResumeDraft(handler: (quotationId: string) => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ quotationId: string }>).detail;
    if (detail?.quotationId) handler(detail.quotationId);
  };
  window.addEventListener(FURNITURE_RESUME_DRAFT_EVENT, listener);
  return () => window.removeEventListener(FURNITURE_RESUME_DRAFT_EVENT, listener);
}
