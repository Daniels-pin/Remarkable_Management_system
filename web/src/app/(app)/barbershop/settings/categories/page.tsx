"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function CategoriesSettingsRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kind = searchParams.get("kind");

  useEffect(() => {
    const tab = kind === "expense" ? "expense" : "sale";
    router.replace(`/barbershop/settings/catalog?tab=${tab}`);
  }, [router, kind]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
      Loading…
    </div>
  );
}
