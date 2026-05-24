"use client";

import { useOperationalPageHeader } from "@/components/layout/page-header-context";

type FurnitureShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
};

/** Sets furniture page header metadata; chrome lives in the section layout. */
export function FurnitureShell({
  title,
  subtitle,
  children,
  headerActions,
}: FurnitureShellProps) {
  useOperationalPageHeader({ title, subtitle, headerActions });
  return <>{children}</>;
}
