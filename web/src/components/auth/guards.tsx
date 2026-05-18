"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  canAccessBarbershopFinance,
  getDeniedBarbershopPath,
  isBarbershopPathAllowed,
} from "@/lib/barbershop-access";
import { isManagerUp } from "@/lib/roles";
import { getPostAuthPath } from "@/lib/routing";

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
      router.replace(getPostAuthPath(session.role));
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
      router.replace(getPostAuthPath(session.role));
    }
  }, [session, loading, router]);

  if (loading) return <LoadingScreen />;
  if (!session) return <LoadingScreen />;
  if (!session.must_change_password) return <LoadingScreen />;
  return <>{children}</>;
}

/** Barbershop management routes: managers and admins only. */
export function RequireManagerOrAdmin({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (!isManagerUp(session.role)) {
      router.replace(getDeniedBarbershopPath(session.role));
    }
  }, [session, loading, router]);

  if (loading) return <LoadingScreen />;
  if (!session || !isManagerUp(session.role)) return <LoadingScreen />;
  return <>{children}</>;
}

/** Finance archive and commission history — barbers and management only. */
export function RequireBarbershopFinance({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (!canAccessBarbershopFinance(session.role)) {
      router.replace(getDeniedBarbershopPath(session.role));
    }
  }, [session, loading, router]);

  if (loading) return <LoadingScreen />;
  if (!session || !canAccessBarbershopFinance(session.role)) return <LoadingScreen />;
  return <>{children}</>;
}

/** Barbershop routes with role-specific path rules (finance, management, etc.). */
export function RequireBarbershopRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (!isBarbershopPathAllowed(pathname, session.role)) {
      router.replace(getDeniedBarbershopPath(session.role));
    }
  }, [session, loading, pathname, router]);

  if (loading) return <LoadingScreen />;
  if (!session || !isBarbershopPathAllowed(pathname, session.role)) return <LoadingScreen />;
  return <>{children}</>;
}

/** Module selector: owner-level route; non-admins are sent to their workspace. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (session.role !== "admin") {
      router.replace(getPostAuthPath(session.role));
    }
  }, [session, loading, router]);

  if (loading) return <LoadingScreen />;
  if (!session || session.role !== "admin") return <LoadingScreen />;
  return <>{children}</>;
}
