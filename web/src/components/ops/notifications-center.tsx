"use client";

import { AlertTriangle, Bell, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { useOpsNotifications } from "@/components/ops/ops-notifications-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NotificationKind } from "@/lib/ops-types";

const KIND: Record<
  NotificationKind,
  { icon: typeof Bell; className: string }
> = {
  approval: {
    icon: CheckCircle2,
    className: "text-emerald-700 dark:text-emerald-300",
  },
  reconciliation: {
    icon: Bell,
    className: "text-amber-800 dark:text-amber-200",
  },
  dispute: {
    icon: AlertTriangle,
    className: "text-rose-700 dark:text-rose-300",
  },
};

export function NotificationsCenter() {
  const { notifications, dismiss } = useOpsNotifications();

  if (!notifications.length) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)]/60 px-6 py-16 text-center">
        <p className="text-sm font-medium text-[var(--foreground)]">You are fully caught up</p>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Pending approvals, reconciliation alerts, and disputes will appear here until resolved.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {notifications.map((n) => {
        const cfg = KIND[n.kind];
        const Icon = cfg.icon;
        return (
          <li
            key={n.id}
            className="flex gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-card)]"
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--muted)]",
                cfg.className,
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-[var(--foreground)]">{n.title}</p>
              <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">{n.body}</p>
              <p className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {new Date(n.createdAt).toLocaleString("en-NG", {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0 self-start rounded-full text-xs"
              onClick={() => dismiss(n.id)}
            >
              Clear
            </Button>
            {n.relatedTransactionId ? (
              <Button
                asChild
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 self-start rounded-full border-dashed text-xs"
              >
                <Link href="/barbershop/reconciliation">Open</Link>
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
