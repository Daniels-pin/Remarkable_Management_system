"use client";

import * as React from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  ApiError,
  getBarberReconciliationCounts,
  getManagerReconciliationCounts,
  type ReconciliationCounts,
} from "@/lib/api";
import { isManagerUp, isServiceProvider } from "@/lib/roles";
import {
  subscribeReconciliationUpdated,
} from "@/lib/reconciliation-events";

type ReconciliationCountsContextValue = {
  counts: ReconciliationCounts;
  pendingCount: number;
  mismatchCount: number;
  loading: boolean;
  refreshCounts: () => Promise<void>;
};

const EMPTY_COUNTS: ReconciliationCounts = { pending: 0, mismatch: 0 };

const ReconciliationCountsContext = React.createContext<ReconciliationCountsContextValue>({
  counts: EMPTY_COUNTS,
  pendingCount: 0,
  mismatchCount: 0,
  loading: true,
  refreshCounts: async () => undefined,
});

export function useReconciliationCounts() {
  return React.useContext(ReconciliationCountsContext);
}

export function ReconciliationCountsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const role = session?.role;
  const canFetch = isManagerUp(role) || isServiceProvider(role);

  const [counts, setCounts] = React.useState<ReconciliationCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = React.useState(canFetch);

  const refreshCounts = React.useCallback(async () => {
    if (!canFetch || !role) {
      setCounts(EMPTY_COUNTS);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = isManagerUp(role)
        ? await getManagerReconciliationCounts()
        : await getBarberReconciliationCounts();
      setCounts(res);
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setCounts(EMPTY_COUNTS);
      }
    } finally {
      setLoading(false);
    }
  }, [canFetch, role]);

  React.useEffect(() => {
    queueMicrotask(() => {
      void refreshCounts();
    });
  }, [refreshCounts]);

  React.useEffect(
    () =>
      subscribeReconciliationUpdated((detail) => {
        if (detail?.pending != null && detail.mismatch != null) {
          setCounts({ pending: detail.pending, mismatch: detail.mismatch });
          return;
        }
        void refreshCounts();
      }),
    [refreshCounts],
  );

  const value = React.useMemo(
    () => ({
      counts,
      pendingCount: counts.pending,
      mismatchCount: counts.mismatch,
      loading,
      refreshCounts,
    }),
    [counts, loading, refreshCounts],
  );

  return (
    <ReconciliationCountsContext.Provider value={value}>
      {children}
    </ReconciliationCountsContext.Provider>
  );
}
