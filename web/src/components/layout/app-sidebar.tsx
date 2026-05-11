"use client";

import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { RemarkableWordmark } from "@/components/branding/remarkable-logo";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { barbershopNav, filterNavForRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "remarkable:sidebar-collapsed";

type AppSidebarProps = {
  className?: string;
};

export function AppSidebar({ className }: AppSidebarProps) {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const items = filterNavForRole(barbershopNav, session?.role);

  const widthClass = collapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-width)]";

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex",
        widthClass,
        className,
      )}
    >
      <div
        className={cn(
          "flex min-h-14 shrink-0 items-center border-b border-[var(--border)] py-2.5",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <Link
          href="/modules"
          className={cn(
            "transition-opacity hover:opacity-70",
            collapsed ? "flex justify-center" : "w-full",
          )}
        >
          <RemarkableWordmark variant={collapsed ? "compact" : "full"} />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const link = (
            <Link
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-[var(--muted)] text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/70 hover:text-[var(--foreground)]",
                collapsed && "justify-center px-0",
              )}
            >
              <item.icon
                className={cn(
                  "h-[1.125rem] w-[1.125rem] shrink-0 opacity-80 transition-opacity group-hover:opacity-100",
                  active && "opacity-100",
                )}
              />
              {!collapsed ? (
                <span className="truncate">{item.label}</span>
              ) : null}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href} delayDuration={200}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return <React.Fragment key={item.href}>{link}</React.Fragment>;
        })}
      </nav>
      <div className="mt-auto space-y-2 p-2">
        <Separator />
        <div className={cn("flex", collapsed ? "justify-center" : "gap-2")}>
          {collapsed ? (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label="Expand sidebar"
                  onClick={toggle}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-1 justify-start gap-2 text-[var(--muted-foreground)]"
              onClick={toggle}
            >
              <ChevronLeft className="h-4 w-4" />
              Collapse
            </Button>
          )}
        </div>
        {collapsed ? (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="w-full"
                aria-label="Sign out"
                onClick={() => void logout()}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2 border-dashed"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        )}
      </div>
    </aside>
  );
}
