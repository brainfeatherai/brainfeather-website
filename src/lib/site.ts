/* ────────────────────────────────────────────────────────────────
   Site-wide constants.

   These live apart from any component because both server and client
   components need them: importing a constant out of `SiteFooter`
   would pull that whole component — and `next/image` with it — into
   the client bundle just to read one string.
   ──────────────────────────────────────────────────────────────── */

/* Canonical origin, no trailing slash. Hardcoded rather than read from
   VERCEL_URL: that variable holds a per-deployment hostname, so preview
   builds would emit OG tags and sitemap entries pointing at themselves
   instead of the real site. */
export const SITE_URL = "https://brainfeather.com";

/** Bare host, for display. */
export const SITE_DOMAIN = "brainfeather.com";

export const CONTACT_EMAIL = "getbrainfeather@gmail.com";

/** Prefills a subject so incoming mail can be triaged. */
export function mailto(subject: string) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[${subject}] `)}`;
}

/* Brand glyphs as single 24×24 fill paths: lucide dropped brand
   icons, and four paths cost less than a dependency. */
export const SOCIALS = [
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/brainfeather/",
    d: "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 013.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 110-4.14 2.07 2.07 0 010 4.14zm1.78 13.02H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z",
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/brainfeather.ai/",
    d: "M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.6 5.6 0 00-2.03 1.32A5.6 5.6 0 00.79 3.98c-.3.76-.5 1.64-.56 2.9C.17 8.17.16 8.58.16 12s.01 3.83.07 5.11c.06 1.27.26 2.15.56 2.91a5.6 5.6 0 001.32 2.03 5.6 5.6 0 002.03 1.32c.76.3 1.64.5 2.91.56 1.28.06 1.69.07 5.11.07s3.83-.01 5.11-.07c1.27-.06 2.15-.26 2.91-.56a5.6 5.6 0 002.03-1.32 5.6 5.6 0 001.32-2.03c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-5.11s-.01-3.83-.07-5.11c-.06-1.27-.26-2.15-.56-2.91a5.6 5.6 0 00-1.32-2.03A5.6 5.6 0 0019.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 01-1.38-.9 3.7 3.7 0 01-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 3.68a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zm0 10.16a4 4 0 110-8 4 4 0 010 8zm7.85-10.4a1.44 1.44 0 11-2.88 0 1.44 1.44 0 012.88 0z",
  },
  {
    name: "X",
    href: "https://x.com/brainfeather",
    d: "M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.6l5.44 7.2 5.86-7.2zm-1.3 19.5h2.04L6.49 3.24H4.3l13.3 17.4z",
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/@Brainfeather",
    d: "M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 00.5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 002.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 002.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z",
  },
];
