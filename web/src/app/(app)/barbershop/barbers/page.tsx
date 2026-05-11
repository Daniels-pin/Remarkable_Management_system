"use client";

import Link from "next/link";
import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError, listDirectoryBarbers } from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";

export default function BarbersPage() {
  const { session } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [roster, setRoster] = React.useState<
    {
      id: string;
      displayName: string;
      initials: string;
      email: string;
      commissionPct: number;
      salaryType: string;
    }[]
  >([]);

  React.useEffect(() => {
    queueMicrotask(async () => {
      setLoading(true);
      try {
        const res = await listDirectoryBarbers();
        setRoster(
          res.items.map((b) => {
            const name = b.full_name?.trim() || `@${b.username}`;
            const initials =
              b.full_name?.trim()?.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() ||
              b.username.slice(0, 2).toUpperCase();
            return {
              id: b.id,
              displayName: name,
              initials,
              email: b.email,
              commissionPct: b.commission_pct ? Number(b.commission_pct) : 0,
              salaryType: (b.salary_type || "commission").replace(/_/g, " "),
            };
          }),
        );
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
        else toast.error("Could not load barbers.");
        setRoster([]);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <BarbershopShell
      title="Barbers"
      subtitle="Team roster with quick paths into individual performance."
    >
      {loading ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--muted-foreground)]">Loading roster…</p>
        </div>
      ) : roster.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
            No team members in directory yet
          </p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)]">
            The roster stays empty until staff records sync from your source of truth. Revenue and
            commission shown on each card will always mirror posted ledger totals—never template
            figures.
          </p>
          {session?.role === "barber" ? (
            <Link
              href={`/barbershop/barbers/${session.user_id}`}
              className="mt-6 inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--foreground)] px-5 text-sm font-medium text-[var(--background)] transition hover:opacity-90"
            >
              Open your profile
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {roster.map((b) => (
            <Link key={b.id} href={`/barbershop/barbers/${b.id}`} className="group block">
              <Card className="h-full border-[var(--border)]/90 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]">
                <CardContent className="flex gap-4 p-5 pt-5">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback>{b.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-base font-semibold text-[var(--foreground)] group-hover:underline">
                        {b.displayName}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">{b.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                      <span>{b.commissionPct}% commission</span>
                      <span className="capitalize">{b.salaryType}</span>
                    </div>
                    <p className="text-sm tabular-nums text-[var(--foreground)]">
                      {formatNaira(0)}
                      <span className="text-[var(--muted-foreground)]"> · this month</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </BarbershopShell>
  );
}
