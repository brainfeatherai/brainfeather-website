import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import { SITE_URL as SITE } from "@/lib/site";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
