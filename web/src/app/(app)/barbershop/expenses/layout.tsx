import { RequireManagerOrAdmin } from "@/components/auth/guards";

export default function ExpensesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireManagerOrAdmin>{children}</RequireManagerOrAdmin>;
}
