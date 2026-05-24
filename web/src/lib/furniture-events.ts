export const FURNITURE_UPDATED_EVENT = "remarkable:furniture-updated";

export function emitFurnitureUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FURNITURE_UPDATED_EVENT));
}

export function subscribeFurnitureUpdated(handler: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(FURNITURE_UPDATED_EVENT, handler);
  return () => window.removeEventListener(FURNITURE_UPDATED_EVENT, handler);
}
