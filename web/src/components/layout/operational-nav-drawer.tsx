"use client";

import { usePathname } from "next/navigation";

import { RemarkableWordmark } from "@/components/branding/remarkable-logo";
import { MobileSidebarNav } from "@/components/layout/mobile-sidebar-nav";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { useAuth } from "@/components/providers/auth-provider";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { canSwitchOperationalWorkspace, getActiveWorkspace } from "@/lib/workspace";

export function OperationalNavDrawer({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { session } = useAuth();
  const workspace = getActiveWorkspace(pathname);
  const showWorkspaceSwitcher = canSwitchOperationalWorkspace(session?.role);

  return (
    <>
      <SheetHeader className="border-b border-[var(--border)] px-4 py-4 text-left">
        <SheetTitle className="text-left">
          <RemarkableWordmark variant="header" module={workspace} />
        </SheetTitle>
      </SheetHeader>
      {showWorkspaceSwitcher ? (
        <div className="border-b border-[var(--border)] p-3">
          <WorkspaceSwitcher layout="full" onSelected={onNavigate} />
        </div>
      ) : null}
      <div className="p-3">
        <MobileSidebarNav onNavigate={onNavigate} />
      </div>
    </>
  );
}
