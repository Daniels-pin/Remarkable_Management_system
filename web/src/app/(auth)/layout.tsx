import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[var(--background)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
        aria-hidden
        style={{
          background:
            "radial-gradient(60% 50% at 50% -10%, color-mix(in oklab, var(--foreground) 8%, transparent), transparent 70%)",
        }}
      />
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-4 py-16">
        {children}
      </div>
    </div>
  );
}
