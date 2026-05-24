"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { OperationalNavDrawer } from "@/components/layout/operational-nav-drawer";
import { usePageHeaderContext } from "@/components/layout/page-header-context";
import { ImpersonationBanner } from "@/components/ops/impersonation-banner";
import { PageTransition } from "@/components/motion/page-transition";
import { useAuth } from "@/components/providers/auth-provider";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getActiveWorkspace } from "@/lib/workspace";

type OperationalShellProps = {
  children: React.ReactNode;
};

export function OperationalShell({ children }: OperationalShellProps) {
  const pathname = usePathname();
  const workspace = getActiveWorkspace(pathname);
  const { header } = usePageHeaderContext();
  const [open, setOpen] = React.useState(false);
  const { session } = useAuth();
  const impersonating = Boolean(session?.impersonating);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div
      key={workspace}
      className="flex min-h-[100dvh] w-full bg-[var(--background)]"
    >
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating ? <ImpersonationBanner /> : null}
        <AppHeader
          title={header.title}
          subtitle={header.subtitle}
          showMenu
          onMenuClick={() => setOpen(true)}
          headerActions={header.headerActions}
        />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="p-0">
            <OperationalNavDrawer onNavigate={() => setOpen(false)} />
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
