import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Clock3,
  Coffee,
  CreditCard,
  HandCoins,
  LayoutDashboard,
  Package,
  Receipt,
  FileText,
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
    label: "Inventory",
    href: "/barbershop/inventory",
    icon: Package,
    roles: managerUp,
  },
  {
    label: "Team Advances",
    href: "/barbershop/team-advances",
    icon: HandCoins,
    roles: managerUp,
  },
  {
    label: "Personal Consumption",
    href: "/barbershop/personal-consumption",
    icon: Coffee,
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

/** Furniture operational navigation — isolated from barbershop workflows. */
export const furnitureNav: NavItem[] = [
  {
    label: "Dashboard",
    href: "/furniture/dashboard",
    icon: LayoutDashboard,
    roles: ["admin"],
  },
  {
    label: "Orders",
    href: "/furniture/orders",
    icon: Package,
    roles: ["admin"],
  },
  {
    label: "Quotations",
    href: "/furniture/quotations",
    icon: FileText,
    roles: ["admin"],
  },
  {
    label: "Invoices",
    href: "/furniture/invoices",
    icon: Receipt,
    roles: ["admin"],
  },
];

export function getNavForPath(pathname: string): NavItem[] {
  if (pathname.startsWith("/furniture")) return furnitureNav;
  return barbershopNav;
}

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
