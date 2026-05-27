"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FurnitureQuotationDraftRecoveryDialog } from "@/components/furniture/furniture-quotation-draft-recovery-dialog";
import { ApiError, getFurnitureQuotation, getFurnitureQuotationActiveAutosave, type FurnitureQuotation } from "@/lib/api";
import {
  hasFurnitureQuotationRecoveryBeenShown,
  readFurnitureQuotationDraft,
} from "@/lib/furniture-quotation-draft";

export function FurnitureQuotationDraftRecoveryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [draft, setDraft] = React.useState<FurnitureQuotation | null>(null);
  const [open, setOpen] = React.useState(false);
  const checkedRef = React.useRef(false);

  React.useEffect(() => {
    if (loading || !session || checkedRef.current || hasFurnitureQuotationRecoveryBeenShown()) {
      return;
    }

    checkedRef.current = true;

    void (async () => {
      try {
        const { draft: serverDraft } = await getFurnitureQuotationActiveAutosave();
        if (serverDraft) {
          setDraft(serverDraft);
          setOpen(true);
          return;
        }

        const localDraft = readFurnitureQuotationDraft(session.user_id);
        if (localDraft?.quotationId) {
          try {
            const linkedDraft = await getFurnitureQuotation(localDraft.quotationId);
            if (linkedDraft.is_autosave_session) {
              setDraft(linkedDraft);
              setOpen(true);
            }
          } catch {
            /* local draft may reference a removed quotation */
          }
        }
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error(err);
        }
      }
    })();
  }, [loading, session]);

  const handleContinue = () => {
    router.push("/furniture/quotations");
  };

  return (
    <>
      {children}
      <FurnitureQuotationDraftRecoveryDialog
        draft={draft}
        open={open}
        onOpenChange={setOpen}
        onContinue={handleContinue}
      />
    </>
  );
}
