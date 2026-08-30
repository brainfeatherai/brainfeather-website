import type { Metadata } from "next";
import { SITE_URL as SITE } from "@/lib/site";
import "./globals.css";

const TITLE = "Brainfeather — Long-term memory for AI agents";
const DESCRIPTION =
  "The memory layer that sits under Claude Code, Cursor and your own agents: it records the facts that matter and hands them back on the next run.";

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
  openGraph: {
    type: "website",
    siteName: "Brainfeather",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
