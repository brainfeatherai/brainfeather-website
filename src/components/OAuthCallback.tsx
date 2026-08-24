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
import { authService } from "@/services/appwrite";

export default function OAuthCallback({
  userId,
  secret,
}: {
  userId: string | null;
  secret: string | null;
}) {
  const started = useRef(false);

  useEffect(() => {
    /* The secret is single-use. React remounts effects in development,
       and a second exchange of a spent secret fails — which would send a
       user who just signed in successfully back to the error page. */
    if (started.current) return;
    started.current = true;

    if (!userId || !secret) {
      window.location.replace("/login?error=oauth");
      return;
    }

    authService
      .completeOAuth(userId, secret)
      .then(() => {
        // Full document load — see note 1 above.
        window.location.replace("/dashboard");
      })
      .catch(() => {
        window.location.replace("/login?error=oauth");
      });
  }, [userId, secret]);

  return (
    <output
      aria-live="polite"
      className="flex min-h-dvh items-center justify-center font-mono text-[11px] uppercase tracking-[0.1em] text-forest/45"
    >
      Signing you in…
    </output>
  );
}
