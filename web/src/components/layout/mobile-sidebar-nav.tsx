"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/providers/auth-provider";
import { OperationalAlertBadge } from "@/components/ui/operational-alert-badge";
import { useReconciliationCounts } from "@/components/ops/reconciliation-counts-context";
import { barbershopNav, filterNavForRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const DAILY_LEDGER_HREF = "/barbershop/daily-ledger";

export function MobileSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { session } = useAuth();
  const items = filterNavForRole(barbershopNav, session?.role);
  const { pendingCount } = useReconciliationCounts();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-[var(--muted)] text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/70 hover:text-[var(--foreground)]",
            )}
          >
            <item.icon className="h-[1.125rem] w-[1.125rem] shrink-0" />
            <span className="min-w-0 flex-1">{item.label}</span>
            {item.href === DAILY_LEDGER_HREF ? (
              <OperationalAlertBadge count={pendingCount} />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
