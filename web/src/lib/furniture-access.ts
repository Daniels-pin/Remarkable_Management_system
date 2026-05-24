import type { UserRole } from "@/lib/api";
import { FURNITURE_HOME_PATH } from "@/lib/routing";

/** Furniture workspace is owner/admin-only for this phase. */
export function isFurniturePathAllowed(
  pathname: string,
  role: UserRole | null | undefined,
): boolean {
  if (!pathname.startsWith("/furniture")) return true;
  return role === "admin";
}

export function getDeniedFurniturePath(role: UserRole | undefined): string {
  if (role === "admin") return FURNITURE_HOME_PATH;
  return "/barbershop/dashboard";
}
