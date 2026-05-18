"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Suspense } from "react";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { CategoriesManagementPanel } from "@/components/ops/categories-management-panel";
import { ServicesManagementPanel } from "@/components/ops/services-management-panel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";

type CatalogTab = "services" | "sale" | "expense";

const TABS: { id: CatalogTab; label: string }[] = [
  { id: "services", label: "Services" },
  { id: "sale", label: "Sale categories" },
  { id: "expense", label: "Expense categories" },
];

function parseTab(value: string | null): CatalogTab {
  if (value === "sale" || value === "expense" || value === "services") return value;
  return "services";
}

export default function CatalogSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
          Loading…
        </div>
      }
    >
      <CatalogSettingsPageInner />
    </Suspense>
  );
}

function CatalogSettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, loading } = useAuth();
  const role = session?.role;
  const allowed = role === "admin" || role === "manager";
  const [tab, setTab] = React.useState<CatalogTab>(() => parseTab(searchParams.get("tab")));

  React.useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  React.useEffect(() => {
    if (loading || !session) return;
    if (!allowed) {
      router.replace("/barbershop/dashboard");
    }
  }, [allowed, loading, router, session]);

  function selectTab(next: CatalogTab) {
    setTab(next);
    router.replace(`/barbershop/settings/catalog?tab=${next}`, { scroll: false });
  }

  if (loading || !session || !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading…
      </div>
    );
  }

  return (
    <BarbershopShell
      title="Catalog"
      subtitle="Manage services, sale categories, and expense categories. Edit names, disable, or remove items — historical ledger records are always preserved."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={tab === id ? "default" : "outline"}
              className={cn(
                "rounded-full transition-colors",
                tab === id
                  ? "border-transparent bg-[var(--foreground)] text-[var(--background)]"
                  : "border-dashed",
              )}
              onClick={() => selectTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        {tab === "services" ? (
          <ServicesManagementPanel key="services" />
        ) : (
          <CategoriesManagementPanel key={tab} kind={tab} />
        )}
      </div>
    </BarbershopShell>
  );
}
