"use client";

/* ────────────────────────────────────────────────────────────────
   Single shared probe for public access status.

   The landing page mounts THREE consumers of this state — SiteNav,
   SiteFooter, and WaitlistForm — and each usePublicAccess() instance
   used to run its own 30-second interval, its own Appwrite
   account.get() probe, and for signed-in visitors its own createJWT()
   plus /api/public/session call. Three of everything, per visitor,
   forever, on an otherwise fully server-rendered marketing page.

   Module-scope singleton instead of a React context: a context would
   still need a provider mounted somewhere above the three consumers,
   and the landing layout is a server component — the singleton keeps
   the change local to this file and its importers.

   The single interval publishes through a tiny subscription registry;
   components read the latest value via useSyncExternalStore, which is
   hydration-safe (no state seeding in effects).
   ──────────────────────────────────────────────────────────────── */

import { useSyncExternalStore } from "react";
import { authService } from "@/services/appwrite";
import {
  createPublicAccessStore,
  type PublicAccess,
} from "./public-access-store-core";

export type { PublicAccess } from "./public-access-store-core";

type ResolvedAccess = Exclude<PublicAccess, "loading">;

async function probeAccess(): Promise<ResolvedAccess> {
  const user = await authService.getCurrentUser();
  if (user) {
    try {
      const jwt = await authService.createJWT();
      const response = await fetch('/api/public/session', {
        headers: { Authorization: `Bearer ${jwt.jwt}` },
        cache: 'no-store',
      });
      if (response.ok) return "console";
    } catch {
      // Fall through to the waitlist approval check.
    }
  }

  try {
    const response = await fetch('/api/public/access', { cache: 'no-store' });
    const body = (await response.json().catch(() => null)) as
      | { status?: "none" | "pending" | "approved" }
      | null;
    return response.ok && body?.status ? body.status : "none";
  } catch {
    return "none";
  }
}

const store = createPublicAccessStore(probeAccess, {
  startInterval(refresh) {
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  },
  listenForVisibility(refresh) {
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  },
});

export function usePublicAccess(): PublicAccess {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => "loading");
}
