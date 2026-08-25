/* ────────────────────────────────────────────────────────────────
   (app) route group — the authenticated product surface.

   Parenthesised, so it adds no URL segment: /login, /dashboard and
   /settings sit at the root path just like the (legal) group's pages.

   The group exists to scope AuthProvider to these three routes. The
   marketing pages must not pay for it — see the note in AuthProvider.

   `robots: noindex` because a signed-out crawler only ever sees a
   redirect or an empty shell here; letting these into the index would
   put content-free URLs in search results.
   ──────────────────────────────────────────────────────────────── */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-dvh flex-col bg-paper">{children}</div>
    </AuthProvider>
  );
}
