"use client";

import * as React from "react";

import { ApiError, listNotifications, type OpsNotificationRow } from "@/lib/api";
import type { NotificationKind, OpsNotification } from "@/lib/ops-types";
import { toast } from "sonner";

type OpsNotificationsValue = {
  notifications: OpsNotification[];
  dismiss: (id: string) => void;
  dismissByTransactionId: (transactionId: string) => void;
  clearResolved: () => void;
  refresh: () => Promise<void>;
};

const Ctx = React.createContext<OpsNotificationsValue | null>(null);

export function OpsNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = React.useState<OpsNotification[]>([]);

  const refresh = React.useCallback(async () => {
    try {
      const res = await listNotifications();
      setNotifications(res.items.map(mapNotification));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load notifications.");
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const dismiss = React.useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const dismissByTransactionId = React.useCallback((transactionId: string) => {
    setNotifications((prev) =>
      prev.filter((n) => n.relatedTransactionId !== transactionId),
    );
  }, []);

  const clearResolved = React.useCallback(() => {
    /* reserved for bulk actions */
  }, []);

  const value = React.useMemo(
    () => ({ notifications, dismiss, dismissByTransactionId, clearResolved, refresh }),
    [notifications, dismiss, dismissByTransactionId, clearResolved, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOpsNotifications() {
  const v = React.useContext(Ctx);
  if (!v) {
    throw new Error("useOpsNotifications requires OpsNotificationsProvider");
  }
  return v;
}

export function useOpsNotificationsSafe() {
  return React.useContext(Ctx);
}

function kindForType(t: OpsNotificationRow["type"]): NotificationKind {
  switch (t) {
    case "pending_approvals":
      return "approval";
    case "low_stock":
      return "inventory";
    case "reconciliation_review_request":
    case "unresolved_mismatch":
      return "reconciliation";
    case "dispute_requires_admin":
    case "dispute_requires_manager":
      return "dispute";
    default:
      return "reconciliation";
  }
}

function mapNotification(n: OpsNotificationRow): OpsNotification {
  const relatedTransactionId =
    n.entity_id && (n.entity_type === "ledger_entry" || n.entity_type === "barber_daily_summary")
      ? n.entity_id
      : undefined;
  const relatedProductId =
    n.entity_id && n.entity_type === "inventory_product" ? n.entity_id : undefined;
  return {
    id: n.id,
    kind: kindForType(n.type),
    title: n.title,
    body: n.body ?? "",
    createdAt: n.created_at,
    relatedTransactionId,
    relatedProductId,
  };
}
