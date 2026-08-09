import type { NextConfig } from "next";

/* The canonical host. Everything SEO-facing already declares the apex —
   canonical tags, sitemap, robots, JSON-LD — so www redirects TO it.
   Flipping this means changing SITE_URL in src/lib/site.ts as well, or
   the redirect and the canonical tags would contradict each other. */
const CANONICAL_HOST = "brainfeather.com";

const nextConfig: NextConfig = {
  /* Drops `X-Powered-By: Next.js`. Minor, but there's no reason to
     hand a scanner the framework name. */
  poweredByHeader: false,

  async redirects() {
    return [
      {
        /* Fixes duplicate content: both hosts were answering 200, so
           crawlers saw two complete copies of the site and split ranking
           signals across them.

           `has: [{type: "host"}]` matches the request's Host header, so
           this is inert on localhost and on *.vercel.app previews — only
           the exact www hostname is rewritten.

           308, not 307: a permanent redirect is what consolidates
           authority onto one host. It is cached hard by browsers, so
           reversing direction later leaves those clients following the
           old redirect until their cache expires. Worth knowing before
           switching to www.

           `:path*` carries the path through, so deep links survive —
           www.../privacy lands on /privacy, not the homepage. */
        source: "/:path*",
        has: [{ type: "host", value: `www.${CANONICAL_HOST}` }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          /* Force HTTPS for two years, including subdomains. Safe here
             because Vercel terminates TLS for every domain it serves.
             Deliberately NOT `preload` — submitting to the preload list
             is close to irreversible and would break any future
             subdomain that cannot serve HTTPS. */
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          /* Stop browsers second-guessing declared MIME types, which is
             how a served asset ends up reinterpreted as script. */
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          /* Full URL to same-origin destinations; cross-origin requests
             get the bare origin. Keeps paths out of third-party referer
             logs without breaking referral attribution. */
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          /* Nothing here uses these APIs, so deny them outright rather
             than leaving it to the browser's default prompt. */
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          /* The modern counterpart to X-Frame-Options, and the one
             browsers actually honour for nested browsing contexts.
             Scoped to framing only: a full CSP would need to account for
             the inline JSON-LD and Next's own inline bootstrap scripts,
             and a wrong one breaks the page silently. */
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
