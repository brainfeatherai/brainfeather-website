"use client";

/* ────────────────────────────────────────────────────────────────
   AuthProvider — session state for the authenticated app shell.

   Deliberately NOT mounted in the root layout. Doing that would turn
   the whole marketing site into a client tree and undo the server-
   component budget the rest of the site is careful about (see the
   note in lib/site.ts). Instead this wraps only the (app) route
   group, so `/`, `/privacy`, `/terms`, `/contact` stay server-rendered.

   Wraps the existing `authService` rather than calling `account`
   directly, so signup keeps its side effect of creating the `users`
   profile document.

   RequireAuth is a UX affordance, not the security boundary. Appwrite
   rejects unauthorised reads regardless of what this renders, so a
   brief pre-redirect flash cannot leak another user's data.
   ──────────────────────────────────────────────────────────────── */

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Models } from "appwrite";
import { authService } from "@/services/appwrite";

type SessionUser = Models.User<Models.Preferences>;

type AuthState = {
  user: SessionUser | null;
  jwt: string | null;
  jwtError: string | null;
  refreshJwt: () => Promise<string | null>;
  /** True until the initial session probe settles. Distinct from "no user". */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  const [jwtError, setJwtError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const authGeneration = useRef(0);
  const refreshInFlight = useRef<{
    generation: number;
    promise: Promise<string | null>;
  } | null>(null);

  const refreshJwt = useCallback(() => {
    const generation = authGeneration.current;
    if (refreshInFlight.current?.generation === generation) {
      return refreshInFlight.current.promise;
    }
    const work = (async () => {
      try {
        const result = await authService.createJWT();
        if (generation !== authGeneration.current) return null;
        setJwt(result.jwt);
        setJwtError(null);
        return result.jwt;
      } catch (error) {
        if (generation !== authGeneration.current) return null;
        /* Keep the existing token: it may still be valid. A transient
           refresh failure should not immediately take the dashboard down. */
        setJwtError(
          error instanceof Error ? error.message : "Could not refresh dashboard access.",
        );
        return null;
      }
    })().finally(() => {
      if (refreshInFlight.current?.promise === work) refreshInFlight.current = null;
    });
    refreshInFlight.current = { generation, promise: work };
    return work;
  }, []);

  useEffect(() => {
    let active = true;
    const generation = authGeneration.current;
    // getCurrentUser() swallows the 401 that Appwrite throws for an
    // anonymous visitor and returns null, so no try/catch needed here.
    authService.getCurrentUser().then(async (u) => {
      if (!active || generation !== authGeneration.current) return;
      setUser(u);
      if (u) await refreshJwt();
      if (active && generation === authGeneration.current) setLoading(false);

      /* An OAuth signup never runs createEmailPassword, so nothing has
         created its `users` row. This is the one place that observes a
         settled session no matter how it was opened, so the backfill
         belongs here.

         Swallowed deliberately: a missing profile row degrades the
         dashboard, but it must not stop a valid session from signing in.
         Relevant today — the collections grant no permissions yet, so
         this throws 403 for every account until that is fixed. */
      if (u) void authService.ensureProfile(u).catch(() => {});
    });
    return () => {
      active = false;
    };
  }, [refreshJwt]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => void refreshJwt(), 45 * 60 * 1000);
    const retryTimer = jwtError
      ? window.setInterval(() => void refreshJwt(), 5 * 60 * 1000)
      : null;
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshJwt();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      if (retryTimer !== null) window.clearInterval(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, jwtError, refreshJwt]);

  const login = useCallback(async (email: string, password: string) => {
    const generation = ++authGeneration.current;
    await authService.createEmailSession(email, password);
    const current = await authService.getCurrentUser();
    if (generation !== authGeneration.current) return;
    setUser(current);
    if (current) await refreshJwt();
  }, [refreshJwt]);

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const generation = ++authGeneration.current;
      await authService.createEmailPassword(email, password, name);
      // create() does not open a session; the caller must sign in.
      await authService.createEmailSession(email, password);
      const current = await authService.getCurrentUser();
      if (generation !== authGeneration.current) return;
      setUser(current);
      if (current) await refreshJwt();
    },
    [refreshJwt],
  );

  const logout = useCallback(async () => {
    authGeneration.current++;
    setUser(null);
    setJwt(null);
    setJwtError(null);
    await authService.logout();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, jwt, jwtError, refreshJwt, loading, login, signup, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/* Gate for pages that require a session. Renders nothing while the
   probe is in flight so the page does not flicker signed-out content
   for a user who is in fact signed in. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <output
        aria-live="polite"
        className="flex min-h-dvh items-center justify-center bg-[#080a09] font-mono text-[11px] uppercase tracking-[0.1em] text-[#eef3f1]/45"
      >
        {loading ? "Checking session…" : "Redirecting…"}
      </output>
    );
  }

  return <>{children}</>;
}
