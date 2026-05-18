"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ServicesSettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/barbershop/settings/catalog?tab=services");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
      Loading…
    </div>
  );
}
