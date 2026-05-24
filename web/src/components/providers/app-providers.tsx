"use client";

import { Toaster } from "sonner";

import { NavigationStabilizer } from "@/components/layout/navigation-stabilizer";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
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
