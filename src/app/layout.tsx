import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import { SITE_URL as SITE } from "@/lib/site";
import {
  baseOpenGraph,
  baseTwitter,
  SITE_DESCRIPTION as DESCRIPTION,
  SITE_TITLE as TITLE,
} from "@/lib/share-metadata";
import "./globals.css";

/* The type the design actually specifies, self-hosted by next/font.

   These were previously named only in a CSS font-family stack —
   `--font-outfit: "Avenir Next", "Segoe UI", system-ui` — with no
   @font-face and no font files in the repo, so Outfit never loaded at
   all: Macs fell through to Avenir Next, Windows to Segoe UI. The
   brand had a different voice per visitor.

   `display: swap` renders fallback text immediately and swaps on load,
   so a slow font never blocks first paint. next/font emits a
   size-adjusted local fallback alongside each face, which keeps that
   swap from shifting layout. */
const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

/* `metadataBase` is what makes every relative URL below resolve to an
   absolute one. Without it, Next falls back to the deployment URL —
   which on Vercel is a per-deployment hostname, so shared links would
   point at a preview build rather than the real domain. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: TITLE,
    /* Child routes set a plain title; this appends the brand for them,
       so /privacy renders "Privacy Policy — Brainfeather" without each
       page repeating it. */
    template: "%s — Brainfeather",
  },
  description: DESCRIPTION,
  applicationName: "Brainfeather",
  keywords: [
    "AI memory",
    "agent memory",
    "MCP server",
    "Claude Code",
    "Cursor",
    "long-term memory",
    "developer tools",
  ],
  /* NO `alternates.canonical` here, and no `openGraph.url`. Both are
     INHERITED by every child route, so setting them at the root made
     /privacy, /terms and /contact each declare the homepage as their
     canonical — which tells search engines those pages are duplicates
     and to index the homepage instead. Each route sets its own. */
  openGraph: { ...baseOpenGraph, title: TITLE, description: DESCRIPTION },
  twitter: { ...baseTwitter, title: TITLE, description: DESCRIPTION },
  /* No root `robots`. index/follow is already the default when the tag
     is absent, and emitting it here collided with the `noindex` Next
     injects on 404 responses — the not-found page shipped both tags. */
  /* Google Search Console ownership proof. Emitted as
     <meta name="google-site-verification" content="..." />.

     Written via the `verification` field rather than a hand-placed
     <meta> in the markup so Next owns the whole <head> — a manual tag
     inside the body of a layout is not guaranteed to be hoisted.

     Not a secret: it proves control of THIS site to Google and grants
     nothing to whoever reads it. Must stay in place permanently —
     Google re-checks periodically and un-verifies the property if the
     tag disappears. */
  verification: {
    google: "siThn7ixNi1FcF1aYfjTtPF0k5uTz5zh4gE27Vcj7T8",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
