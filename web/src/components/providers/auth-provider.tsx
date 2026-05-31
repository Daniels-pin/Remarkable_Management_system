"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import type { SessionInfo } from "@/lib/api";
import {
  ApiError,
  getSession,
  login as apiLogin,
  logout as apiLogout,
  NetworkError,
  SESSION_INVALID_EVENT,
} from "@/lib/api";

const SESSION_WARN_SECONDS = 300;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const BOOTSTRAP_RETRY_DELAYS_MS = [0, 400, 1200];

type AuthState = {
  session: SessionInfo | null;
  loading: boolean;
  refresh: (opts?: { silent?: boolean }) => Promise<SessionInfo | null>;
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
  const sessionRef = React.useRef<SessionInfo | null>(null);

  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refresh = React.useCallback(async (opts?: { silent?: boolean }) => {
    const delays = opts?.silent ? [0] : BOOTSTRAP_RETRY_DELAYS_MS;
    let lastError: unknown;

    for (const delay of delays) {
      if (delay > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
      try {
        const s = await getSession();
        setSession(s);
        return s;
      } catch (e) {
        lastError = e;
        if (e instanceof ApiError && e.status === 401) {
          setSession(null);
          return null;
        }
      }
    }

    // Transient network/server errors must not wipe an active session.
    console.error(lastError);
    if (lastError instanceof NetworkError && sessionRef.current) {
      return sessionRef.current;
    }
    return null;
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => {
      void refresh().finally(() => setLoading(false));
    });
  }, [refresh]);

  // Live expiry countdown — decays every second without waiting for API refresh.
  React.useEffect(() => {
    if (!session?.expires_at) {
      queueMicrotask(() => setWarnAtSeconds(0));
      return;
    }

    const expiresAtMs = new Date(session.expires_at).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      setWarnAtSeconds(remaining);
      if (remaining <= 0) {
        setSession(null);
        router.replace("/login");
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session?.expires_at, session?.user_id, router]);

  // Extend idle timeout when the tab becomes visible again (mobile backgrounding).
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && sessionRef.current) {
        void refresh({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // Periodic session touch while the user is active.
  React.useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh({ silent: true });
      }
    }, SESSION_TOUCH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [session, refresh]);

  // Any API call that returns session/auth 401 invalidates local state.
  React.useEffect(() => {
    const onInvalid = () => {
      setSession(null);
      router.replace("/login");
    };
    window.addEventListener(SESSION_INVALID_EVENT, onInvalid);
    return () => window.removeEventListener(SESSION_INVALID_EVENT, onInvalid);
  }, [router]);

  const login = React.useCallback(
    async (username_or_email: string, password: string) => {
      try {
        const s = await apiLogin(username_or_email, password);
        setSession(s);
        return s;
      } catch (e) {
        if (e instanceof ApiError && !e.skipUserNotification) {
          toast.error(e.message);
        } else if (!(e instanceof ApiError)) {
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

export { SESSION_WARN_SECONDS };
