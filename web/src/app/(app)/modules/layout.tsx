import { RequireAdmin } from "@/components/auth/guards";

export default function ModulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
