import { RequireAuth } from "@/components/auth/guards";

export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
