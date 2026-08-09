import type { MetadataRoute } from "next";
import { SITE_URL as SITE } from "@/lib/site";

/* Serves /sitemap.xml.

   Every URL derives from SITE_URL, so the file can only ever list the
   canonical host. That matters more than it looks: Search Console
   rejects sitemap URLs that fall outside the property they were
   submitted to, so a mix of www and apex entries silently drops half
   the file rather than erroring loudly.

   Dates are hardcoded, never `new Date()`. A computed date changes on
   every deploy and claims the legal pages were revised when they
   weren't, which teaches crawlers to ignore the signal. Each date below
   matches what the page itself displays, so the sitemap and the visible
   "Last updated" line can't contradict each other.

   `changeFrequency` and `priority` are hints Google has said it largely
   disregards; kept because other crawlers still read them and they cost
   nothing. `lastModified` is the field that actually earns a recrawl, so
   it's the one worth keeping honest. */
const SITE_CHANGED = new Date("2026-08-09"); // icons, JSON-LD, canonicals
const LEGAL_CHANGED = new Date("2026-08-08"); // matches the pages' own "Last updated"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE,
      lastModified: SITE_CHANGED,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE}/contact`,
      lastModified: SITE_CHANGED,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    /* Legal pages are listed deliberately. They're low priority and
       nobody searches for them, but an indexed privacy policy is a
       trust signal, and leaving them out of the sitemap while linking
       them site-wide is an inconsistency worth avoiding. */
    {
      url: `${SITE}/privacy`,
      lastModified: LEGAL_CHANGED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE}/terms`,
      lastModified: LEGAL_CHANGED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
