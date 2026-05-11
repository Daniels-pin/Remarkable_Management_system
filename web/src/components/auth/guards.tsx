"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { useAuth } from "@/components/providers/auth-provider";

function LoadingScreen() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--background)] px-6">
      <div
        className="h-9 w-9 animate-pulse rounded-full border border-[var(--border)] border-t-[var(--foreground)]"
        aria-hidden
      />
      <p className="text-sm text-[var(--muted-foreground)]">Loading</p>
    </div>
  );
}

/** Authenticated routes: redirects to login or forced password change. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.must_change_password) {
      router.replace("/set-password");
    }
  }, [session, loading, router]);

  if (loading) return <LoadingScreen />;
  if (!session) return <LoadingScreen />;
  if (session.must_change_password) return <LoadingScreen />;
  return <>{children}</>;
}

/** Auth screens: signed-in users leave for modules or password flow. */
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (session.must_change_password) {
      router.replace("/set-password");
    } else {
      router.replace("/modules");
    }
  }, [session, loading, router]);

  if (loading) return <LoadingScreen />;
  if (session) return <LoadingScreen />;
  return <>{children}</>;
}

/** Password change: requires an active session. */
export function RequirePasswordChange({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!session.must_change_password) {
      router.replace("/modules");
    }
  }, [session, loading, router]);

  if (loading) return <LoadingScreen />;
  if (!session) return <LoadingScreen />;
  if (!session.must_change_password) return <LoadingScreen />;
  return <>{children}</>;
}
