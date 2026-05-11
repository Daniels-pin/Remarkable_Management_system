"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import type { SessionInfo } from "@/lib/api";
import { ApiError, getSession, login as apiLogin, logout as apiLogout } from "@/lib/api";

type AuthState = {
  session: SessionInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<SessionInfo>;
  logout: () => Promise<void>;
  warnAtSeconds: number;
};

const AuthContext = React.createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = React.useState<SessionInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [warnAtSeconds, setWarnAtSeconds] = React.useState(0);

  const refresh = React.useCallback(async () => {
    try {
      const s = await getSession();
      setSession(s);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSession(null);
        return;
      }
      console.error(e);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  // Session timeout warnings: keep UI operational before 401s happen.
  React.useEffect(() => {
    if (!session) {
      queueMicrotask(() => setWarnAtSeconds(0));
      return;
    }
    const tick = () => {
      setWarnAtSeconds(session.seconds_until_expiry);
    };
    tick();
    const id = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(id);
  }, [session]);

  React.useEffect(() => {
    if (!session) return;
    if (session.seconds_until_expiry <= 0) {
      queueMicrotask(() => {
        setSession(null);
        router.replace("/login");
        router.refresh();
      });
    }
  }, [session, router]);

  const login = React.useCallback(
    async (username_or_email: string, password: string) => {
      try {
        const s = await apiLogin(username_or_email, password);
        setSession(s);
        return s;
      } catch (e) {
        if (e instanceof ApiError) {
          toast.error(e.message);
        } else {
          toast.error("Could not sign in.");
        }
        throw e;
      }
    },
    [],
  );

  const logout = React.useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* still clear local session */
    }
    setSession(null);
    toast.success("Signed out");
    router.push("/login");
    router.refresh();
  }, [router]);

  const value = React.useMemo(
    () => ({
      session,
      loading,
      refresh,
      login,
      logout,
      warnAtSeconds,
    }),
    [session, loading, refresh, login, logout, warnAtSeconds],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
