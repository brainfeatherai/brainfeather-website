import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/* Serves /robots.txt. A route file rather than a static public/robots.txt
   so the sitemap URL is built from the same constant as everything else
   and can't drift out of sync. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
