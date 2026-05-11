import { MinimalHeader } from "@/components/layout/minimal-header";
import { WorkspacePlaceholder } from "@/components/workspace/workspace-placeholder";

export default function FurniturePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--background)]">
      <MinimalHeader />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 md:px-8 md:py-14">
        <WorkspacePlaceholder
          title="Furniture module"
          description="This module is reserved for future showroom and inventory workflows. Use Barbershop for live operations today."
        />
      </div>
    </div>
  );
}
