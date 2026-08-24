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
  useState,
  type ReactNode,
} from "react";
import type { Models } from "appwrite";
import { authService } from "@/services/appwrite";

type SessionUser = Models.User<Models.Preferences>;

type AuthState = {
  user: SessionUser | null;
  /** True until the initial session probe settles. Distinct from "no user". */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // getCurrentUser() swallows the 401 that Appwrite throws for an
    // anonymous visitor and returns null, so no try/catch needed here.
    authService.getCurrentUser().then((u) => {
      if (!active) return;
      setUser(u);
      setLoading(false);

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
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await authService.createEmailSession(email, password);
    setUser(await authService.getCurrentUser());
  }, []);

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      await authService.createEmailPassword(email, password, name);
      // create() does not open a session; the caller must sign in.
      await authService.createEmailSession(email, password);
      setUser(await authService.getCurrentUser());
    },
    [],
  );

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
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
        className="flex min-h-[60vh] items-center justify-center font-mono text-[11px] uppercase tracking-[0.1em] text-forest/45"
      >
        {loading ? "Checking session…" : "Redirecting…"}
      </output>
    );
  }

  return <>{children}</>;
}
