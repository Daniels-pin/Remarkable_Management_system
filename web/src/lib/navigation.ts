import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CreditCard,
  LayoutDashboard,
  Receipt,
  RefreshCw,
  Scissors,
  UserCircle,
  Users,
} from "lucide-react";

import type { UserRole } from "@/lib/api";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** If omitted, all authenticated roles may see the item. */
  roles?: UserRole[];
};

const managerUp: UserRole[] = ["admin", "manager"];
const staffOps: UserRole[] = ["admin", "manager", "staff", "barber"];

export const barbershopNav: NavItem[] = [
  {
    label: "Dashboard",
    href: "/barbershop/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Daily Ledger",
    href: "/barbershop/daily-ledger",
    icon: BookOpen,
    roles: staffOps,
  },
  {
    label: "Barbers",
    href: "/barbershop/barbers",
    icon: Scissors,
    roles: staffOps,
  },
  {
    label: "Reconciliation",
    href: "/barbershop/reconciliation",
    icon: RefreshCw,
    roles: staffOps,
  },
  {
    label: "Expenses",
    href: "/barbershop/expenses",
    icon: Receipt,
    roles: managerUp,
  },
  {
    label: "Finance",
    href: "/barbershop/finance",
    icon: CreditCard,
    roles: managerUp,
  },
  {
    label: "Users",
    href: "/barbershop/users",
    icon: Users,
    roles: ["admin"],
  },
  {
    label: "Profile",
    href: "/barbershop/profile",
    icon: UserCircle,
  },
  {
    label: "Notifications",
    href: "/barbershop/notifications",
    icon: Bell,
  },
];

export function filterNavForRole(
  items: NavItem[],
  role: UserRole | null | undefined,
): NavItem[] {
  if (!role) return [];
  return items.filter((item) => {
    if (!item.roles?.length) return true;
    return item.roles.includes(role);
  });
}
