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
import { normalizeWaitlistEmail } from "@/lib/waitlist-email-address";

type SessionUser = Models.User<Models.Preferences>;

type AuthState = {
  user: SessionUser | null;
  jwt: string | null;
  jwtError: string | null;
  refreshJwt: () => Promise<string | null>;
  /** True until the initial session probe settles. Distinct from "no user". */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, inviteId: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
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
    let settled = false;
    const generation = authGeneration.current;
    const finish = () => {
      if (!active || settled || generation !== authGeneration.current) return;
      settled = true;
      setLoading(false);
    };
    /* Appwrite's account.get() can hang when the endpoint is unreachable.
       Fail open to /login instead of leaving the console on "Checking session…". */
    const timer = window.setTimeout(() => {
      setUser(null);
      finish();
    }, 8_000);
    // getCurrentUser() swallows the 401 that Appwrite throws for an
    // anonymous visitor and returns null, so no try/catch needed here.
    authService.getCurrentUser().then(async (u) => {
      if (!active || settled || generation !== authGeneration.current) return;
      if (u) {
        const accessJwt = await refreshJwt();
        if (settled || generation !== authGeneration.current) return;
        if (!accessJwt) {
          await authService.logout().catch(() => {});
          if (active && !settled) setUser(null);
        } else {
          try {
            await authService.ensureProfile(accessJwt);
            if (active && !settled) setUser(u);
          } catch {
            await authService.logout().catch(() => {});
            if (active && !settled) {
              setUser(null);
              setJwt(null);
              setJwtError('Your Brainfeather access request has not been approved yet.');
            }
          }
        }
      } else {
        setUser(null);
      }
      finish();
    }).finally(() => {
      window.clearTimeout(timer);
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
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
    try {
      const current = await authService.getCurrentUser();
      if (generation !== authGeneration.current) return;
      if (current) {
        const accessJwt = await refreshJwt();
        if (!accessJwt) throw new Error('Could not establish dashboard access.');
        await authService.ensureProfile(accessJwt);
        setUser(current);
      }
    } catch (error) {
      await authService.logout().catch(() => {});
      setUser(null);
      setJwt(null);
      throw error;
    }
  }, [refreshJwt]);

  const signup = useCallback(
    async (email: string, password: string, name: string, inviteId: string) => {
      const generation = ++authGeneration.current;
      const accountEmail = normalizeWaitlistEmail(email);
      await authService.createEmailPassword(accountEmail, password, name, inviteId);
      // create() does not open a session; the caller must sign in.
      await authService.createEmailSession(accountEmail, password);
      try {
        const current = await authService.getCurrentUser();
        if (generation !== authGeneration.current) return;
        if (current) {
          const accessJwt = await refreshJwt();
          if (!accessJwt) throw new Error('Could not establish dashboard access.');
          await authService.ensureProfile(accessJwt);
          setUser(current);
        }
      } catch (error) {
        await authService.logout().catch(() => {});
        setUser(null);
        setJwt(null);
        throw error;
      }
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

  const deleteAccount = useCallback(async () => {
    const credential = jwt ?? (await refreshJwt());
    if (!credential) throw new Error('Dashboard authentication is unavailable.');
    const response = await fetch('/api/v1/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${credential}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? 'Could not delete your account.');
    }
    authGeneration.current++;
    setUser(null);
    setJwt(null);
    setJwtError(null);
  }, [jwt, refreshJwt]);

  return (
    <AuthContext.Provider
      value={{ user, jwt, jwtError, refreshJwt, loading, login, signup, logout, deleteAccount }}
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
