import { RequireManagerOrAdmin } from "@/components/auth/guards";

export default function BarbersManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireManagerOrAdmin>{children}</RequireManagerOrAdmin>;
}
