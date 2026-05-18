"use client";

import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { TeamPosturePill } from "@/components/ops/team-posture-pill";
import type { DirectoryTeamRow, ReconciliationPosture } from "@/lib/api";
import { formatNaira, formatServicesCount } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TeamMemberCardData = {
  id: string;
  displayName: string;
  initials: string;
  email: string;
  role: "barber" | "staff";
  monthRevenue: number;
  servicesCount: number;
  expectedPayout: number;
  salaryType: string;
  commissionPct: number;
  reconciliationPosture: ReconciliationPosture;
};

export function teamRowToCard(row: DirectoryTeamRow): TeamMemberCardData {
  const name = row.full_name?.trim() || `@${row.username}`;
  const initials =
    row.full_name
      ?.trim()
      ?.split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || row.username.slice(0, 2).toUpperCase();

  return {
    id: row.id,
    displayName: name,
    initials,
    email: row.email,
    role: row.role,
    monthRevenue: Number(row.current_month_revenue ?? 0),
    servicesCount: row.current_month_services_count ?? 0,
    expectedPayout: Number(row.expected_payout ?? 0),
    salaryType: (row.salary_type || "commission").replace(/_/g, " "),
    commissionPct: row.commission_pct ? Number(row.commission_pct) : 0,
    reconciliationPosture: row.reconciliation_posture ?? "clear",
  };
}

function payoutLabel(member: TeamMemberCardData) {
  if (member.role === "staff" && member.salaryType.includes("fixed")) {
    return "Salary";
  }
  return member.role === "barber" ? "Commission" : "Payout";
}

export function TeamMemberCard({
  member,
  hidePayroll = false,
}: {
  member: TeamMemberCardData;
  /** Hide commission, salary, and payout — manager operational view. */
  hidePayroll?: boolean;
}) {
  const pay = payoutLabel(member);

  return (
    <Link href={`/barbershop/team/${member.id}`} className="group block">
      <Card className="h-full border-[var(--border)]/90 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]">
        <CardContent className="flex flex-col gap-4 p-5 pt-5">
          <div className="flex gap-4">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarFallback>{member.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-[var(--foreground)] group-hover:underline">
                  {member.displayName}
                </p>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                    member.role === "barber"
                      ? "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
                      : "border-sky-500/20 bg-sky-500/8 text-sky-900 dark:text-sky-200",
                  )}
                >
                  {member.role === "barber" ? "Barber" : "Staff"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">{member.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)]/80 pt-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                This month
              </p>
              <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums text-[var(--foreground)]">
                {formatNaira(member.monthRevenue)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                Services
              </p>
              <p className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tabular-nums text-[var(--foreground)]">
                {formatServicesCount(member.servicesCount)}
              </p>
            </div>
            {!hidePayroll ? (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  {pay}
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatNaira(member.expectedPayout)}
                </p>
                {member.role === "barber" && member.commissionPct > 0 ? (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {member.commissionPct}% rate
                  </p>
                ) : (
                  <p className="text-[11px] capitalize text-[var(--muted-foreground)]">
                    {member.salaryType}
                  </p>
                )}
              </div>
            ) : null}
            <div
              className={cn(
                "flex flex-col justify-end",
                hidePayroll && "sm:col-start-2",
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                Reconciliation
              </p>
              <div className="mt-1.5">
                <TeamPosturePill posture={member.reconciliationPosture} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
