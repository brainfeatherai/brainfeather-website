"use client";

/* ────────────────────────────────────────────────────────────────
   OAuthCallback — trades the one-time OAuth secret for a session.

   Two things here are deliberate and load-bearing.

   1. A FULL page navigation on success, not router.replace().

      The (app) layout mounts AuthProvider, which probes the session
      once on mount. On this route that probe runs BEFORE the exchange
      below finishes, so the provider settles on `user: null`. A
      client-side navigation to /dashboard would keep that stale state,
      RequireAuth would see no user, and it would bounce straight back
      to /login — the OAuth round trip appearing to fail after it had
      actually succeeded. Reloading the document remounts the provider,
      which then probes against the session that now exists.

   2. No useState anywhere.

      Every outcome is a redirect, so there is nothing to hold. That
      also sidesteps react-hooks/set-state-in-effect, which correctly
      objects to seeding state from inside an effect.
   ──────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import { AccountApiError, authService } from "@/services/appwrite";

export default function OAuthCallback({
  userId,
  secret,
  inviteId,
}: {
  userId: string | null;
  secret: string | null;
  inviteId: string | null;
}) {
  const started = useRef(false);

  useEffect(() => {
    /* The secret is single-use. React remounts effects in development,
       and a second exchange of a spent secret fails — which would send a
       user who just signed in successfully back to the error page. */
    if (started.current) return;
    started.current = true;

    if (!userId || !secret) {
      const query = new URLSearchParams({ error: 'oauth' });
      if (inviteId) query.set('invite', inviteId);
      window.location.replace(`/login?${query}`);
      return;
    }

    authService
      .completeOAuth(userId, secret)
      .then(async () => {
        const jwt = await authService.createJWT();
        try {
          await authService.verifyDashboardSession(jwt.jwt, inviteId ?? undefined);
        } catch (error) {
          const denied = error instanceof AccountApiError &&
            (error.status === 401 || error.status === 403);
          if (denied) await authService.logout().catch(() => {});
          const query = new URLSearchParams({
            error: denied ? (inviteId ? 'invite' : 'access') : 'unavailable',
          });
          if (inviteId) query.set('invite', inviteId);
          window.location.replace(`/login?${query}`);
          return;
        }
        // Full document load — see note 1 above.
        window.location.replace("/overview");
      })
      .catch(async () => {
        await authService.logout().catch(() => {});
        const query = new URLSearchParams({ error: 'oauth' });
        if (inviteId) query.set('invite', inviteId);
        window.location.replace(`/login?${query}`);
      });
  }, [userId, secret, inviteId]);

  return (
    <output
      aria-live="polite"
      className="flex min-h-dvh items-center justify-center font-mono text-[11px] uppercase tracking-[0.1em] text-forest/45"
    >
      Signing you in…
    </output>
  );
}
