"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import {
  TeamUsersPanel,
  type TeamUsersPanelHandle,
} from "@/components/ops/team-users-panel";
import { Button } from "@/components/ui/button";

export default function UsersPage() {
  const panelRef = React.useRef<TeamUsersPanelHandle>(null);

  const headerActions = (
    <Button
      type="button"
      size="sm"
      className="hidden h-9 rounded-full px-4 font-medium shadow-sm md:inline-flex"
      onClick={() => panelRef.current?.openCreateUser()}
    >
      <Plus className="mr-1.5 opacity-80" data-icon="inline-start" />
      Create user
    </Button>
  );

  return (
    <BarbershopShell
      title="Users"
      subtitle="Provision accounts, roles, pay structures, and privileged controls."
      headerActions={headerActions}
    >
      <TeamUsersPanel ref={panelRef} />
    </BarbershopShell>
  );
}
