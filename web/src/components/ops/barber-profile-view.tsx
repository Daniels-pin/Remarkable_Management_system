"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  PayoutWithAttendance,
  type PayoutAttendanceBreakdown,
} from "@/components/ops/payout-with-attendance";
import { formatNaira, formatServicesCount } from "@/lib/format";
import type { BarberProfile, TeamMemberProfile } from "@/lib/ops-types";
import { cn } from "@/lib/utils";

function isTeamProfile(p: BarberProfile | TeamMemberProfile): p is TeamMemberProfile {
  return "role" in p;
}

function FinanceStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p
        className={cn(
          "font-[family-name:var(--font-serif)] text-xl font-semibold leading-tight tracking-tight",
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FinanceSummaryCard({
  title,
  stats,
  payoutLabel = "Payout",
  payoutBreakdown,
}: {
  title: string;
  stats: {
    revenue: number;
    services: number;
    payout: number;
    approved?: number;
    pending?: number;
  };
  payoutLabel?: string;
  payoutBreakdown?: PayoutAttendanceBreakdown;
}) {
  const metricCount =
    2 +
    (stats.approved != null ? 1 : 0) +
    (stats.pending != null ? 1 : 0) +
    1;
  const cols =
    metricCount >= 5
      ? "sm:grid-cols-2 lg:grid-cols-5"
      : metricCount >= 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-3";
  return (
    <Card>
      <CardContent className="p-5 pt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          {title}
        </p>
        <div className={cn("mt-5 grid grid-cols-1 gap-5 sm:gap-4", cols)}>
          <FinanceStat label="Revenue" value={formatNaira(stats.revenue)} />
          <FinanceStat
            label="Services"
            value={formatServicesCount(stats.services)}
            valueClassName="text-[var(--foreground)]"
          />
          {stats.approved != null ? (
            <FinanceStat
              label="Approved"
              value={formatNaira(stats.approved)}
              valueClassName="text-emerald-800 dark:text-emerald-200"
            />
          ) : null}
          {stats.pending != null ? (
            <FinanceStat
              label="Pending"
              value={formatNaira(stats.pending)}
              valueClassName="text-amber-900 dark:text-amber-100"
            />
          ) : null}
          {payoutBreakdown ? (
            <div className="min-w-0 sm:col-span-2 lg:col-span-2">
              <PayoutWithAttendance
                compact
                data={payoutBreakdown}
                expectedLabel={`Expected ${payoutLabel.toLowerCase()}`}
                actualLabel={`Actual ${payoutLabel.toLowerCase()}`}
              />
            </div>
          ) : (
            <FinanceStat
              label={payoutLabel}
              value={formatNaira(stats.payout)}
              valueClassName="text-emerald-700 dark:text-emerald-300"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function payStructureSummary(profile: BarberProfile | TeamMemberProfile) {
  const type = profile.salaryType.replace(/_/g, " ");
  if (isTeamProfile(profile) && profile.fixedSalary != null && profile.fixedSalary > 0) {
    if (profile.role === "staff") {
      return `${type} · ${formatNaira(profile.fixedSalary)} / mo`;
    }
    return `${profile.commissionPct}% commission · ${type} · ${formatNaira(profile.fixedSalary)} base`;
  }
  if (profile.commissionPct > 0) {
    return `${profile.commissionPct}% commission · ${type}`;
  }
  return type;
}

function ProfileHeaderInner({
  profile,
  variant,
}: {
  profile: BarberProfile | TeamMemberProfile;
  variant: "full" | "embedded";
}) {
  const team = isTeamProfile(profile);

  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-card)] md:flex-row md:items-start",
        variant === "embedded" && "rounded-[var(--radius-lg)] p-5",
      )}
    >
      <Avatar className={cn("h-20 w-20", variant === "embedded" && "h-16 w-16")}>
        <AvatarFallback className="text-lg">{profile.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              {profile.displayName}
            </h2>
            {team ? (
              <span className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                {profile.role === "barber" ? "Barber" : "Staff"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {profile.email} · {profile.phone}
          </p>
        </div>
        {team ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Pay structure
            </p>
            <p className="mt-1 text-sm text-[var(--foreground)]">{payStructureSummary(profile)}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Commission
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{profile.commissionPct}%</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Salary type
              </p>
              <p className="mt-1 text-sm capitalize text-[var(--foreground)]">
                {profile.salaryType.replace(/_/g, " ")}
              </p>
            </div>
          </div>
        )}
        {variant === "full" ? (
          <>
            <Separator />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Bank details
              </p>
              <p className="mt-2 text-sm text-[var(--foreground)]">{profile.bankName}</p>
              <p className="text-sm tabular-nums text-[var(--muted-foreground)]">
                {profile.accountNumber} · {profile.accountName}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function TeamMemberProfileView({
  profile,
  variant = "full",
  monthPayoutBreakdown,
}: {
  profile: TeamMemberProfile;
  variant?: "full" | "embedded";
  monthPayoutBreakdown?: PayoutAttendanceBreakdown;
}) {
  const payoutLabel =
    profile.role === "staff" && profile.salaryType.includes("fixed") ? "Salary" : "Payout";

  return (
    <div className={cn("space-y-8", variant === "embedded" && "space-y-6")}>
      <ProfileHeaderInner profile={profile} variant={variant} />
      <div className="grid gap-4 lg:grid-cols-2">
        <FinanceSummaryCard
          title="This month"
          stats={profile.monthStats}
          payoutLabel={payoutLabel}
          payoutBreakdown={monthPayoutBreakdown}
        />
        <FinanceSummaryCard
          title="All-time"
          stats={profile.allTimeStats}
          payoutLabel={payoutLabel}
        />
      </div>
    </div>
  );
}

export function BarberProfileView({
  profile,
  variant = "full",
}: {
  profile: BarberProfile;
  variant?: "full" | "embedded";
}) {
  return (
    <TeamMemberProfileView
      profile={{ ...profile, role: "barber", fixedSalary: null }}
      variant={variant}
    />
  );
}
