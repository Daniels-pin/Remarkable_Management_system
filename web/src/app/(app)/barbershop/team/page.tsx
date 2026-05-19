"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { TeamMemberCard, teamRowToCard } from "@/components/ops/team-member-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError, listDirectoryTeam } from "@/lib/api";
import { canAccessBarbershopUsers } from "@/lib/barbershop-access";
import { isAdmin } from "@/lib/roles";
import { subscribePayoutUpdated } from "@/lib/payout-events";
import { cn } from "@/lib/utils";

type TeamFilter = "all" | "barber" | "staff";

const FILTERS: { id: TeamFilter; label: string }[] = [
  { id: "all", label: "All team" },
  { id: "barber", label: "Barbers" },
  { id: "staff", label: "Staff" },
];

export default function TeamPage() {
  const { session } = useAuth();
  const canCreateUser = canAccessBarbershopUsers(session?.role);
  const adminView = isAdmin(session?.role);

  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<TeamFilter>("all");
  const [roster, setRoster] = React.useState<ReturnType<typeof teamRowToCard>[]>([]);

  const loadRoster = React.useCallback(async () => {
    setLoading(true);
    try {
      const roleParam = filter === "all" ? undefined : filter;
      const res = await listDirectoryTeam(roleParam);
      setRoster(res.items.map(teamRowToCard));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load team roster.");
      setRoster([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  React.useEffect(() => {
    queueMicrotask(() => void loadRoster());
  }, [loadRoster]);

  React.useEffect(() => subscribePayoutUpdated(() => void loadRoster()), [loadRoster]);

  const filtered =
    filter === "all" ? roster : roster.filter((m) => m.role === filter);

  return (
    <BarbershopShell
      title="Team"
      subtitle="Workforce performance — barbers and staff in one operational workspace."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={filter === id ? "default" : "outline"}
              className={cn(
                "rounded-full transition-colors",
                filter === id
                  ? "border-transparent bg-[var(--foreground)] text-[var(--background)]"
                  : "border-dashed",
              )}
              onClick={() => setFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm text-[var(--muted-foreground)]">Loading team…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center shadow-[var(--shadow-card)]">
            <p className="font-[family-name:var(--font-serif)] text-xl font-medium text-[var(--foreground)]">
              No team members added yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
              Add barbers and staff to track revenue, services, payouts, and reconciliation from a
              single roster.
            </p>
            {canCreateUser ? (
              <Link
                href="/barbershop/users"
                className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-[var(--foreground)] px-6 text-sm font-medium text-[var(--background)] shadow-sm transition-opacity hover:opacity-90"
              >
                <Plus className="mr-1.5 size-4 opacity-80" />
                Create user
              </Link>
            ) : (
              <p className="mt-6 text-xs text-[var(--muted-foreground)]">
                Ask an administrator to provision new accounts.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((member) => (
              <TeamMemberCard key={member.id} member={member} hidePayroll={!adminView} />
            ))}
          </div>
        )}
      </div>
    </BarbershopShell>
  );
}
