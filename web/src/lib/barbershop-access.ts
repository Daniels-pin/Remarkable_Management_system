import type { UserRole } from "@/lib/api";
import { isManagerUp } from "@/lib/roles";

/** Management-only barbershop areas (roster, expenses, catalog settings). */
export function canAccessBarberManagement(role: UserRole | undefined): boolean {
  return isManagerUp(role);
}

export function canAccessBarbershopUsers(role: UserRole | undefined): boolean {
  return role === "admin";
}

/** Finance — personal earnings for barbers/staff; operational or full for management. */
export function canAccessBarbershopFinance(role: UserRole | undefined): boolean {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "barber" ||
    role === "staff"
  );
}

export function isPersonalFinanceRole(role: UserRole | undefined): boolean {
  return role === "barber" || role === "staff";
}

/** Where to send barber/staff when they hit a management-only route. */
export const BARBERSHOP_EMPLOYEE_HOME = "/barbershop/dashboard";

export function getDeniedBarbershopPath(role: UserRole | undefined): string {
  return BARBERSHOP_EMPLOYEE_HOME;
}

export function isBarbershopPathAllowed(
  pathname: string,
  role: UserRole | undefined,
): boolean {
  if (!role) return false;

  if (pathname.startsWith("/barbershop/settings/attendance")) {
    return role === "admin";
  }
  if (pathname.startsWith("/barbershop/attendance")) {
    return role === "admin" || role === "manager" || role === "barber" || role === "staff";
  }
  if (pathname.startsWith("/barbershop/team") || pathname.startsWith("/barbershop/barbers")) {
    return canAccessBarberManagement(role);
  }
  if (pathname.startsWith("/barbershop/expenses")) {
    return canAccessBarberManagement(role);
  }
  if (pathname.startsWith("/barbershop/users")) {
    return canAccessBarbershopUsers(role);
  }
  if (pathname.startsWith("/barbershop/settings")) {
    return canAccessBarberManagement(role);
  }
  if (pathname.startsWith("/barbershop/finance")) {
    return canAccessBarbershopFinance(role);
  }

  return true;
}
