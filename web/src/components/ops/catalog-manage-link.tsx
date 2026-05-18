"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

type CatalogManageLinkProps = {
  href: string;
  label?: string;
  className?: string;
};

export function CatalogManageLink({
  href,
  label = "Manage in settings",
  className,
}: CatalogManageLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "text-xs text-[var(--muted-foreground)] underline-offset-2 transition-colors hover:text-[var(--foreground)] hover:underline",
        className,
      )}
    >
      {label}
    </Link>
  );
}
