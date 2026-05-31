"use client";

import * as React from "react";
import { Toaster, toast } from "sonner";

import { NavigationStabilizer } from "@/components/layout/navigation-stabilizer";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

const SUPPRESSED_TOAST_MESSAGES = new Set([
  "Missing session",
  "Session expired or invalid",
  "This account is not active.",
]);

/** Prevent duplicate session/auth toasts while AuthProvider redirects to login. */
function SessionToastFilter() {
  React.useEffect(() => {
    const original = toast.error.bind(toast);
    toast.error = ((message, data) => {
      if (typeof message === "string" && SUPPRESSED_TOAST_MESSAGES.has(message)) {
        return "";
      }
      return original(message, data);
    }) as typeof toast.error;
    return () => {
      toast.error = original;
    };
  }, []);
  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SessionToastFilter />
        <TooltipProvider delayDuration={280}>
          <NavigationStabilizer />
          {children}
          <Toaster
            position="top-center"
            richColors={false}
            toastOptions={{
              classNames: {
                toast:
                  "!rounded-[var(--radius-md)] !border !border-[var(--border)] !bg-[var(--card)] !text-[var(--foreground)] !shadow-[var(--shadow-card)]",
                title: "!font-medium !text-sm",
                description: "!text-[var(--muted-foreground)] !text-xs",
              },
            }}
          />
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
