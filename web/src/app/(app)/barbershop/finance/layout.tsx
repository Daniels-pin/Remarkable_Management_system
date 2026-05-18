import { RequireBarbershopFinance } from "@/components/auth/guards";

export default function BarbershopFinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireBarbershopFinance>{children}</RequireBarbershopFinance>;
}
