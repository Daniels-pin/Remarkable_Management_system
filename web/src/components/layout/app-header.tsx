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
import { useAuth } from "@/components/providers/auth-provider";
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
  const { session, logout, refresh } = useAuth();
  const impersonating = Boolean(session?.impersonating);
  const seconds = session?.seconds_until_expiry ?? 0;
  const expiringSoon = seconds > 0 && seconds <= 5 * 60;
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-md md:px-6",
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
        <div className="hidden shrink-0 items-center gap-2 md:flex">{headerActions}</div>
      ) : null}
      <div className="flex items-center gap-1">
        {expiringSoon ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden rounded-full border-dashed text-xs md:inline-flex"
            onClick={() => void refresh()}
          >
            Session expiring · extend
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
