"use client";

import { LogOut } from "lucide-react";
import { usePathname } from "next/navigation";

import { RemarkableWordmark } from "@/components/branding/remarkable-logo";
import { MobileSidebarNav } from "@/components/layout/mobile-sidebar-nav";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { canSwitchOperationalWorkspace, getActiveWorkspace } from "@/lib/workspace";

export function OperationalNavDrawer({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const workspace = getActiveWorkspace(pathname);
  const showWorkspaceSwitcher = canSwitchOperationalWorkspace(session?.role);

  return (
    <div className="flex h-full min-h-0 flex-col">
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
      <div className="flex flex-1 flex-col p-3">
        <MobileSidebarNav onNavigate={onNavigate} />
        <div className="mt-auto border-t border-[var(--border)] pt-3">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={() => {
              onNavigate?.();
              void logout();
            }}
          >
            <LogOut className="h-[1.125rem] w-[1.125rem] shrink-0" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
