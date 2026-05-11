import { RequireAuth } from "@/components/auth/guards";

export default function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAuth>{children}</RequireAuth>;
}
