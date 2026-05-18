import { RequireManagerOrAdmin } from "@/components/auth/guards";

export default function BarbershopSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireManagerOrAdmin>{children}</RequireManagerOrAdmin>;
}
