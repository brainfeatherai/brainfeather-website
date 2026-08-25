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
      {/* min-h-dvh, NOT min-h-full. `min-h-full` is a percentage, and it
          resolves against the PARENT's height — body only sets
          `min-height`, never a definite height, so the percentage
          collapsed to content height. The panel then sized to its own
          content and body's forest-deep background showed as a dead
          green band underneath it. Viewport units skip the chain.

          The `dark` class on <html> is set by ThemeProvider below and
          toggles CSS custom properties so every bg-paper/text-forest
          utility recolours automatically. */}
      <ThemeProvider>
        <div className="flex min-h-dvh flex-col bg-paper">{children}</div>
      </ThemeProvider>
    </AuthProvider>
  );
}

/* Lightweight client-side theme provider — reads localStorage on
   mount and toggles the `dark` class on <html>. No context needed;
   the CSS variables do all the work. */
function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('bf-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
        }}
      />
      {children}
    </>
  );
}
