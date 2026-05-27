import type { FurnitureQuotationSectionRow } from "@/lib/furniture-quotation-sections";

export const FURNITURE_QUOTATION_DRAFT_STORAGE_KEY = "remarkable:furniture-quotation-draft";
export const FURNITURE_QUOTATION_RECOVERY_SHOWN_KEY = "remarkable:furniture-quotation-recovery-shown";
export const FURNITURE_QUOTATION_RESUME_ID_KEY = "remarkable:furniture-quotation-resume-id";

export const AUTOSAVE_CUSTOMER_NAME = "Draft";
export const AUTOSAVE_CUSTOMER_PHONE = "-";
export const AUTOSAVE_SECTION_TITLE = "Section";

export type FurnitureQuotationFormDraft = {
  userId: string;
  quotationId: string | null;
  savedAt: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  dateIssued: string;
  discount: string;
  taxPercent: string;
  sections: FurnitureQuotationSectionRow[];
};

export function isAutosavePlaceholderCustomer(name: string, phone: string) {
  return name.trim() === AUTOSAVE_CUSTOMER_NAME && phone.trim() === AUTOSAVE_CUSTOMER_PHONE;
}

export function customerNameFromDraft(name: string, phone: string) {
  return isAutosavePlaceholderCustomer(name, phone) ? "" : name;
}

export function customerPhoneFromDraft(name: string, phone: string) {
  return isAutosavePlaceholderCustomer(name, phone) ? "" : phone;
}

export function sectionTitleFromDraft(title: string, isAutosaveSession: boolean) {
  if (isAutosaveSession && title.trim() === AUTOSAVE_SECTION_TITLE) {
    return "";
  }
  return title;
}

export function hasQuotationDraftContent(draft: {
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  discount: string;
  taxPercent: string;
  sections: FurnitureQuotationSectionRow[];
}) {
  if (draft.customerName.trim() || draft.customerAddress.trim() || draft.customerPhone.trim()) {
    return true;
  }
  if (draft.discount.trim() || draft.taxPercent.trim()) {
    return true;
  }
  return draft.sections.some(
    (section) =>
      section.title.trim() ||
      section.items.some(
        (item) =>
          item.name.trim() ||
          (item.description?.trim() ?? "") ||
          item.quantity > 0 ||
          item.unit_price > 0,
      ),
  );
}

export function readFurnitureQuotationDraft(userId: string): FurnitureQuotationFormDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FURNITURE_QUOTATION_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FurnitureQuotationFormDraft;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeFurnitureQuotationDraft(draft: FurnitureQuotationFormDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FURNITURE_QUOTATION_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearFurnitureQuotationDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(FURNITURE_QUOTATION_DRAFT_STORAGE_KEY);
}

export function markFurnitureQuotationRecoveryShown() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(FURNITURE_QUOTATION_RECOVERY_SHOWN_KEY, "1");
}

export function hasFurnitureQuotationRecoveryBeenShown() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(FURNITURE_QUOTATION_RECOVERY_SHOWN_KEY) === "1";
}

export function setFurnitureQuotationResumeId(quotationId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(FURNITURE_QUOTATION_RESUME_ID_KEY, quotationId);
}

export function consumeFurnitureQuotationResumeId() {
  if (typeof window === "undefined") return null;
  const id = window.sessionStorage.getItem(FURNITURE_QUOTATION_RESUME_ID_KEY);
  if (id) window.sessionStorage.removeItem(FURNITURE_QUOTATION_RESUME_ID_KEY);
  return id;
}
