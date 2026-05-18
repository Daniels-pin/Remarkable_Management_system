"use client";

import { MoreHorizontal } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CategoryStatus } from "@/lib/api";
import { formatCatalogDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CatalogDeleteDialog } from "./catalog-delete-dialog";
import { CatalogStatusPill } from "./catalog-status-pill";

export type CatalogManageItem = {
  id: string;
  name: string;
  status: CategoryStatus;
  created_at?: string | null;
};

type CatalogManagementListProps = {
  items: CatalogManageItem[];
  entityLabel: string;
  updatingId: string | null;
  onEdit: (item: CatalogManageItem) => void;
  onDisable: (item: CatalogManageItem) => void;
  onDelete: (item: CatalogManageItem) => void;
  onReactivate?: (item: CatalogManageItem) => void;
};

export function CatalogManagementList({
  items,
  entityLabel,
  updatingId,
  onEdit,
  onDisable,
  onDelete,
  onReactivate,
}: CatalogManagementListProps) {
  const [deleteTarget, setDeleteTarget] = React.useState<CatalogManageItem | null>(null);

  return (
    <>
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
        {items.map((item) => {
          const created = formatCatalogDate(item.created_at);
          const isArchived = item.status === "archived";
          const isActive = item.status === "active";
          const busy = updatingId === item.id;

          return (
            <li
              key={item.id}
              className={cn(
                "group flex items-center gap-3 px-4 py-3.5 transition-colors duration-200 sm:px-5 sm:py-4",
                "hover:bg-[var(--muted)]/35",
                isArchived && "opacity-75",
              )}
            >
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-medium tracking-tight",
                    isArchived && "text-[var(--muted-foreground)]",
                  )}
                >
                  {item.name}
                </p>
                {created ? (
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Added {created}</p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                <CatalogStatusPill status={item.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${entityLabel} actions`}
                      disabled={busy}
                      className={cn(
                        "opacity-60 transition-opacity duration-200",
                        "group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                      )}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[9.5rem]">
                    <DropdownMenuItem onClick={() => onEdit(item)}>Edit</DropdownMenuItem>
                    {isActive ? (
                      <DropdownMenuItem onClick={() => onDisable(item)}>Disable</DropdownMenuItem>
                    ) : null}
                    {!isActive && onReactivate ? (
                      <DropdownMenuItem onClick={() => onReactivate(item)}>
                        Reactivate
                      </DropdownMenuItem>
                    ) : null}
                    {!isArchived ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                          onClick={() => setDeleteTarget(item)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>

      <CatalogDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        itemName={deleteTarget?.name ?? ""}
        entityLabel={entityLabel}
        confirming={Boolean(deleteTarget && updatingId === deleteTarget.id)}
        onConfirm={() => {
          if (!deleteTarget) return;
          onDelete(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
