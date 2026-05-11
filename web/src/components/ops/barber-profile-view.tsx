"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatNaira } from "@/lib/format";
import type { BarberProfile } from "@/lib/ops-types";
import { cn } from "@/lib/utils";

export function BarberProfileView({
  profile,
  variant = "full",
}: {
  profile: BarberProfile;
  variant?: "full" | "embedded";
}) {
  return (
    <div className={cn("space-y-8", variant === "embedded" && "space-y-6")}>
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
            <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              {profile.displayName}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {profile.email} · {profile.phone}
            </p>
          </div>
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-5 pt-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              This month
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[var(--muted-foreground)]">Revenue</p>
                <p className="mt-0.5 font-semibold tabular-nums">{formatNaira(profile.monthStats.revenue)}</p>
              </div>
              <div>
                <p className="text-[var(--muted-foreground)]">Payout</p>
                <p className="mt-0.5 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatNaira(profile.monthStats.payout)}
                </p>
              </div>
              <div>
                <p className="text-[var(--muted-foreground)]">Services</p>
                <p className="mt-0.5 font-medium tabular-nums">{formatNaira(profile.monthStats.services)}</p>
              </div>
              <div>
                <p className="text-[var(--muted-foreground)]">Product</p>
                <p className="mt-0.5 font-medium tabular-nums">{formatNaira(profile.monthStats.product)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 pt-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              All-time
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[var(--muted-foreground)]">Revenue</p>
                <p className="mt-0.5 font-semibold tabular-nums">{formatNaira(profile.allTimeStats.revenue)}</p>
              </div>
              <div>
                <p className="text-[var(--muted-foreground)]">Payout</p>
                <p className="mt-0.5 font-semibold tabular-nums">{formatNaira(profile.allTimeStats.payout)}</p>
              </div>
              <div>
                <p className="text-[var(--muted-foreground)]">Services</p>
                <p className="mt-0.5 font-medium tabular-nums">{formatNaira(profile.allTimeStats.services)}</p>
              </div>
              <div>
                <p className="text-[var(--muted-foreground)]">Product</p>
                <p className="mt-0.5 font-medium tabular-nums">{formatNaira(profile.allTimeStats.product)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
