import type { MetadataRoute } from "next";
import { SITE_URL as SITE } from "@/lib/site";

/* Serves /sitemap.xml.

   `lastModified` is a fixed date, not `new Date()`: a computed date
   would change on every build and tell crawlers the legal pages were
   revised when nothing had. Bump it when the content actually changes. */
const UPDATED = new Date("2026-08-09");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE,
      lastModified: UPDATED,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE}/contact`,
      lastModified: UPDATED,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${SITE}/privacy`,
      lastModified: UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE}/terms`,
      lastModified: UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
