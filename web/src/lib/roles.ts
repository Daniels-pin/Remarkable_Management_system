import type { UserRole } from "@/lib/api";

export function isAdmin(role: UserRole | undefined): boolean {
  return role === "admin";
}

export function isManager(role: UserRole | undefined): boolean {
  return role === "manager";
}

export function isManagerUp(role: UserRole | undefined): boolean {
  return role === "admin" || role === "manager";
}

/** Barbers and service staff who record their own services. */
export function isServiceProvider(role: UserRole | undefined): boolean {
  return role === "barber" || role === "staff";
}

/** Personal commission/salary statement archive only — no shop-wide finance. */
export function isPersonalFinanceRole(role: UserRole | undefined): boolean {
  return role === "barber" || role === "staff";
}
