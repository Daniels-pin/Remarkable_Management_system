import { RequireAdmin } from "@/components/auth/guards";

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
