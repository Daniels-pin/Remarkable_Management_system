"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import * as React from "react";

import { RemarkableWordmark } from "@/components/branding/remarkable-logo";
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

export function MinimalHeader() {
  const { setTheme, resolvedTheme } = useTheme();
  const { session, logout } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--background)]/70 md:px-8">
      <Link
        href="/modules"
        className="opacity-90 transition-opacity hover:opacity-100"
      >
        <RemarkableWordmark variant="header" />
      </Link>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
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
            <Button type="button" variant="ghost" size="sm" className="text-xs">
              Account
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <span className="text-xs capitalize text-[var(--muted-foreground)]">
                {session?.role ?? "User"}
              </span>
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
