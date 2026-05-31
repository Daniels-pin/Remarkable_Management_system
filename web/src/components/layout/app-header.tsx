"use client";

import { Moon, PanelLeft, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SESSION_WARN_SECONDS, useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
  showMenu?: boolean;
  headerActions?: React.ReactNode;
};

export function AppHeader({
  title,
  subtitle,
  onMenuClick,
  showMenu,
  headerActions,
}: AppHeaderProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const { session, logout, refresh, warnAtSeconds } = useAuth();
  const impersonating = Boolean(session?.impersonating);
  const expiringSoon = warnAtSeconds > 0 && warnAtSeconds <= SESSION_WARN_SECONDS;
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur-md sm:gap-3 sm:px-4 md:px-6",
        impersonating
          ? "border-amber-500/40 bg-[var(--background)]/90 supports-[backdrop-filter]:bg-[var(--background)]/75"
          : "border-[var(--border)] bg-[var(--background)]/80 supports-[backdrop-filter]:bg-[var(--background)]/65",
      )}
    >
      {showMenu ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          onClick={onMenuClick}
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <h1 className="truncate text-sm font-semibold tracking-tight text-[var(--foreground)] md:text-base">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-xs text-[var(--muted-foreground)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {headerActions ? (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto sm:gap-2">
          {headerActions}
        </div>
      ) : null}
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {expiringSoon ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full border-dashed px-2 text-[10px] sm:px-3 sm:text-xs"
            onClick={() => void refresh({ silent: true })}
          >
            <span className="sm:hidden">Extend</span>
            <span className="hidden sm:inline">Session expiring · extend</span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-[var(--radius-md)]"
          aria-label="Toggle theme"
          onClick={() =>
            setTheme(resolvedTheme === "dark" ? "light" : "dark")
          }
        >
          {mounted && resolvedTheme === "dark" ? (
            <Sun className="h-[1.125rem] w-[1.125rem]" />
          ) : (
            <Moon className="h-[1.125rem] w-[1.125rem]" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-9 gap-2 px-2 font-normal"
            >
              <UserRound className="h-[1.125rem] w-[1.125rem] text-[var(--muted-foreground)]" />
              <span className="hidden max-w-[8rem] truncate text-xs text-[var(--muted-foreground)] sm:inline">
                {session?.role ?? "—"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-[var(--muted-foreground)]">
                  Signed in
                </span>
                <span className="text-sm capitalize text-[var(--foreground)]">
                  {session?.role ?? "User"}
                  {impersonating ? (
                    <span className="mt-1 block text-[11px] font-normal normal-case tracking-wide text-amber-700 dark:text-amber-300">
                      Impersonation active
                    </span>
                  ) : null}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
