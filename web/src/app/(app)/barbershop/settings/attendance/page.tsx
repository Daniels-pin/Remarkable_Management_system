"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { AttendanceSettingsPanel } from "@/components/ops/attendance-settings-panel";
import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { useAuth } from "@/components/providers/auth-provider";

export default function AttendanceSettingsPage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  React.useEffect(() => {
    if (loading || !session) return;
    if (session.role !== "admin") {
      router.replace("/barbershop/dashboard");
    }
  }, [loading, router, session]);

  if (loading || session?.role !== "admin") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading…
      </div>
    );
  }

  return (
    <BarbershopShell
      subtitle="Configure shop location, geofence radius, and attendance discipline rules."
      title="Attendance Settings"
    >
      <AttendanceSettingsPanel />
    </BarbershopShell>
  );
}
