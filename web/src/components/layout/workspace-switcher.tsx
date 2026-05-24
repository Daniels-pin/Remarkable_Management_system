"use client";

import { Check, ChevronsUpDown, Scissors, Sofa } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  canSwitchOperationalWorkspace,
  getActiveWorkspace,
  getWorkspaceDefinition,
  OPERATIONAL_WORKSPACES,
  type OperationalWorkspace,
} from "@/lib/workspace";
import { cn } from "@/lib/utils";

const WORKSPACE_ICONS: Record<OperationalWorkspace, typeof Scissors> = {
  barbershop: Scissors,
  furniture: Sofa,
};

type WorkspaceSwitcherProps = {
  /** Called after selecting a different workspace (e.g. close mobile drawer). */
  onSelected?: () => void;
  /** Sidebar collapsed rail uses icon-only trigger. */
  layout?: "default" | "compact" | "full";
  className?: string;
};

export function WorkspaceSwitcher({
  onSelected,
  layout = "default",
  className,
}: WorkspaceSwitcherProps) {
  const pathname = usePathname();
  const { session } = useAuth();
  const [open, setOpen] = React.useState(false);

  if (!canSwitchOperationalWorkspace(session?.role)) {
    return null;
  }

  const active = getActiveWorkspace(pathname);
  const current = getWorkspaceDefinition(active);
  const CurrentIcon = WORKSPACE_ICONS[active];

  const switchTo = (workspace: OperationalWorkspace) => {
    setOpen(false);
    onSelected?.();
    if (workspace === active) return;

    const target = getWorkspaceDefinition(workspace).homePath;
    // Full document navigation resets Radix portals, scroll locks, and stale shell state.
    window.location.assign(target);
  };

  const trigger =
    layout === "compact" ? (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn("h-9 w-9 shrink-0 border-dashed", className)}
        aria-label={`Switch workspace · ${current.label}`}
      >
        <ChevronsUpDown className="h-4 w-4" />
      </Button>
    ) : layout === "full" ? (
      <Button
        type="button"
        variant="outline"
        className={cn(
          "h-auto w-full justify-between gap-2 rounded-[var(--radius-md)] border-dashed px-3 py-2.5 text-left",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <CurrentIcon className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-[var(--foreground)]">
              {current.shortLabel}
            </span>
            <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
              Switch workspace
            </span>
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
      </Button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-8 w-full justify-between gap-2 border-dashed px-2.5 text-left text-xs",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CurrentIcon className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
          <span className="truncate">{current.shortLabel}</span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </Button>
    );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={layout === "compact" ? "right" : "bottom"}
        className="w-56"
      >
        <DropdownMenuLabel className="text-xs font-normal text-[var(--muted-foreground)]">
          Operational workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPERATIONAL_WORKSPACES.map((workspace) => {
          const Icon = WORKSPACE_ICONS[workspace.id];
          const selected = workspace.id === active;
          return (
            <DropdownMenuItem
              key={workspace.id}
              className="gap-2"
              onSelect={() => switchTo(workspace.id)}
            >
              <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />
              <span className="min-w-0 flex-1 truncate">{workspace.label}</span>
              {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
