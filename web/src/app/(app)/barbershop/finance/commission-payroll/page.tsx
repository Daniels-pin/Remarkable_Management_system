"use client";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { CommissionPayrollPanel } from "@/components/ops/commission-payroll-panel";
import { useAuth } from "@/components/providers/auth-provider";
import { useRouter } from "next/navigation";
import * as React from "react";

export default function CommissionPayrollPage() {
  const { session } = useAuth();
  const router = useRouter();
  const isAdmin = session?.role === "admin";

  React.useEffect(() => {
    if (session && !isAdmin) {
      router.replace("/barbershop/finance");
    }
  }, [session, isAdmin, router]);

  if (!isAdmin) {
    return null;
  }

  return (
    <BarbershopShell
      title="Commission payroll"
      subtitle="Month-end commission obligations with approved revenue and attendance deductions."
    >
      <CommissionPayrollPanel />
    </BarbershopShell>
  );
}
