/** Operational workforce roles shown on Team directory and related UI. */
export type OperationalTeamRole = "manager" | "barber" | "staff";

export const OPERATIONAL_TEAM_ROLES: OperationalTeamRole[] = [
  "manager",
  "barber",
  "staff",
];

export function teamRoleLabel(role: OperationalTeamRole): string {
  switch (role) {
    case "manager":
      return "Manager";
    case "barber":
      return "Barber";
    case "staff":
      return "Staff";
  }
}

export function compareOperationalTeamRoles(
  a: OperationalTeamRole,
  b: OperationalTeamRole,
): number {
  return OPERATIONAL_TEAM_ROLES.indexOf(a) - OPERATIONAL_TEAM_ROLES.indexOf(b);
}

export function isOperationalTeamRole(role: string): role is OperationalTeamRole {
  return OPERATIONAL_TEAM_ROLES.includes(role as OperationalTeamRole);
}
