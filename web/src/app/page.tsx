"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { getPostAuthPath } from "@/lib/routing";

export default function HomePage() {
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
      return;
    }
    router.replace(getPostAuthPath(session.role));
  }, [session, loading, router]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--background)]">
      <div
        className="h-10 w-10 animate-pulse rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)]"
        aria-hidden
      />
      <p className="text-sm text-[var(--muted-foreground)]">Opening Remarkable</p>
    </div>
  );
}
