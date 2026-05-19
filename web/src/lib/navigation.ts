import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Clock3,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Settings2,
  UsersRound,
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
const employeeOps: UserRole[] = ["admin", "manager", "staff", "barber"];
/** Personal earnings archive for barbers/staff; shop finance for management. */
const barbershopFinance: UserRole[] = ["admin", "manager", "barber", "staff"];

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
    roles: employeeOps,
  },
  {
    label: "Attendance",
    href: "/barbershop/attendance",
    icon: Clock3,
    roles: ["admin", "manager", "staff", "barber"],
  },
  {
    label: "Team",
    href: "/barbershop/team",
    icon: UsersRound,
    roles: managerUp,
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
    roles: barbershopFinance,
  },
  {
    label: "Users",
    href: "/barbershop/users",
    icon: Users,
    roles: ["admin"],
  },
  {
    label: "Attendance Settings",
    href: "/barbershop/settings/attendance",
    icon: Settings2,
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
