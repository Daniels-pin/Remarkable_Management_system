"use client";

import { Eye, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError, stopImpersonation } from "@/lib/api";

export function ImpersonationBanner() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [busy, setBusy] = React.useState(false);

  const end = async () => {
    setBusy(true);
    try {
      await stopImpersonation();
      await refresh();
      toast.success("Returned to your admin session.");
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not end impersonation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-500/35 bg-gradient-to-r from-amber-500/12 via-amber-400/10 to-amber-500/12 px-4 py-2.5 text-center text-[13px] text-amber-950 dark:text-amber-100"
    >
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        <span className="font-medium tracking-tight">
          You are viewing this account in impersonation mode
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={busy}
        className="h-7 rounded-full border-amber-600/40 bg-[var(--background)]/80 text-[12px] text-amber-950 hover:bg-[var(--background)] dark:border-amber-400/40 dark:text-amber-50"
        onClick={() => void end()}
      >
        <LogOut className="mr-1 h-3.5 w-3.5" />
        End impersonation
      </Button>
    </div>
  );
}
