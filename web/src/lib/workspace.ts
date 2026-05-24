import type { BusinessModuleBrand } from "@/components/branding/remarkable-logo";
import type { UserRole } from "@/lib/api";
import { BARBERSHOP_HOME_PATH, FURNITURE_HOME_PATH } from "@/lib/routing";

export type OperationalWorkspace = BusinessModuleBrand;

export type WorkspaceDefinition = {
  id: OperationalWorkspace;
  label: string;
  shortLabel: string;
  homePath: string;
};

export const OPERATIONAL_WORKSPACES: WorkspaceDefinition[] = [
  {
    id: "barbershop",
    label: "Remarkable Barbershop",
    shortLabel: "Barbershop",
    homePath: BARBERSHOP_HOME_PATH,
  },
  {
    id: "furniture",
    label: "Remarkable Furniture",
    shortLabel: "Furniture",
    homePath: FURNITURE_HOME_PATH,
  },
];

export function getActiveWorkspace(pathname: string): OperationalWorkspace {
  if (pathname.startsWith("/furniture")) return "furniture";
  return "barbershop";
}

export function getWorkspaceDefinition(id: OperationalWorkspace): WorkspaceDefinition {
  return OPERATIONAL_WORKSPACES.find((w) => w.id === id) ?? OPERATIONAL_WORKSPACES[0];
}

/** Admin-only for now; extend when furniture staff roles are introduced. */
export function canSwitchOperationalWorkspace(role: UserRole | null | undefined): boolean {
  return role === "admin";
}
