import type { UserRole } from "@/lib/api";

export const MODULES_PATH = "/modules";
export const BARBERSHOP_HOME_PATH = "/barbershop/dashboard";

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
