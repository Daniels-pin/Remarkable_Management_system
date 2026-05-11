"use client";

import * as React from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileSidebarNav } from "@/components/layout/mobile-sidebar-nav";
import { ImpersonationBanner } from "@/components/ops/impersonation-banner";
import { PageTransition } from "@/components/motion/page-transition";
import { useAuth } from "@/components/providers/auth-provider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type BarbershopShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
};

export function BarbershopShell({
  title,
  subtitle,
  children,
  headerActions,
}: BarbershopShellProps) {
  const [open, setOpen] = React.useState(false);
  const { session } = useAuth();
  const impersonating = Boolean(session?.impersonating);

  return (
    <div className="flex min-h-[100dvh] w-full bg-[var(--background)]">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating ? <ImpersonationBanner /> : null}
        <AppHeader
          title={title}
          subtitle={subtitle}
          showMenu
          onMenuClick={() => setOpen(true)}
          headerActions={headerActions}
        />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="p-0">
            <SheetHeader className="border-b border-[var(--border)] px-4 py-4 text-left">
              <SheetTitle className="text-sm font-medium">Navigation</SheetTitle>
            </SheetHeader>
            <div className="p-3">
              <MobileSidebarNav onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-7xl">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
