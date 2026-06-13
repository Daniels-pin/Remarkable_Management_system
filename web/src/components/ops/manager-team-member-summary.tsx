"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MonthPostureSummary,
  type MonthPostureData,
} from "@/components/ops/month-posture-summary";
import { TeamPosturePill } from "@/components/ops/team-posture-pill";
import { formatNaira, formatServicesCount } from "@/lib/format";
import type { ReconciliationPosture } from "@/lib/api";
import { type OperationalTeamRole, teamRoleLabel } from "@/lib/team-roles";
import { cn } from "@/lib/utils";

export type ManagerTeamMemberSummaryProps = {
  displayName: string;
  initials: string;
  role: OperationalTeamRole;
  email: string;
  phone: string;
  monthRevenue: number;
  monthServices: number;
  reconciliationPosture: ReconciliationPosture;
  monthPosture: MonthPostureData;
  statsYear?: number;
  statsMonth?: number;
};

export function ManagerTeamMemberSummary({
  displayName,
  initials,
  role,
  email,
  phone,
  monthRevenue,
  monthServices,
  reconciliationPosture,
  monthPosture,
  statsYear,
  statsMonth,
}: ManagerTeamMemberSummaryProps) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <Avatar className="h-20 w-20 shrink-0">
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                  {displayName}
                </h2>
                <span className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  {teamRoleLabel(role)}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {email}
                {phone && phone !== "—" ? ` · ${phone}` : null}
              </p>
            </div>
            {role !== "manager" ? (
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  Reconciliation
                </p>
                <div className="mt-1.5 flex justify-end">
                  <TeamPosturePill posture={reconciliationPosture} />
                </div>
              </div>
            ) : null}
          </div>

          {role !== "manager" ? (
            <>
              <div className="grid gap-4 border-t border-[var(--border)]/80 pt-5 sm:grid-cols-2">
                <Stat label="This month revenue" value={formatNaira(monthRevenue)} />
                <Stat
                  label="Services this month"
                  value={formatServicesCount(monthServices)}
                  muted
                />
              </div>

              <div className="space-y-3 border-t border-[var(--border)]/80 pt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  Financial summary
                </p>
                <MonthPostureSummary
                  data={monthPosture}
                  year={statsYear}
                  month={statsMonth}
                />
              </div>
            </>
          ) : (
            <p className="border-t border-[var(--border)]/80 pt-5 text-sm text-[var(--muted-foreground)]">
              Management account — attendance and profile details below. Service reconciliation
              applies to barbers and staff.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-[family-name:var(--font-serif)] text-xl font-semibold tabular-nums tracking-tight text-[var(--foreground)]",
          muted && "text-[var(--foreground)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}
