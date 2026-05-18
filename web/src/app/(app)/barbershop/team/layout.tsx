import { RequireManagerOrAdmin } from "@/components/auth/guards";

export default function TeamManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireManagerOrAdmin>{children}</RequireManagerOrAdmin>;
}
