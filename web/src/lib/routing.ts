import type { UserRole } from "@/lib/api";

export const MODULES_PATH = "/modules";
export const BARBERSHOP_HOME_PATH = "/barbershop/dashboard";
export const FURNITURE_HOME_PATH = "/furniture/dashboard";

/** Post-login landing: Admin selects a business module; everyone else enters Barbershop. */
export function getPostAuthPath(role: UserRole): string {
  return role === "admin" ? MODULES_PATH : BARBERSHOP_HOME_PATH;
}

export function isAdminRole(role: UserRole | undefined): boolean {
  return role === "admin";
}

/** Logo / wordmark destination for the current session. */
export function getHomePath(role: UserRole | undefined): string {
  return isAdminRole(role) ? MODULES_PATH : BARBERSHOP_HOME_PATH;
}

/** Module-aware home when inside a workspace section. */
export function getWorkspaceHomePath(
  pathname: string,
  role: UserRole | undefined,
): string {
  if (pathname.startsWith("/furniture")) return FURNITURE_HOME_PATH;
  if (pathname.startsWith("/barbershop")) return BARBERSHOP_HOME_PATH;
  return getHomePath(role);
}
