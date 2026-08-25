import * as Sentry from "@sentry/nextjs";

/* Sentry init is a no-op without a DSN, so dev and preview run clean
   with nothing configured. Set NEXT_PUBLIC_SENTRY_DSN to activate. */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  /* Vercel sets VERCEL_ENV (production/preview/development); events are
     filterable by it in the dashboard. */
  environment: process.env.VERCEL_ENV ?? "development",

  /* Release ties runtime errors to the exact commit, so source maps
     uploaded by withSentryConfig resolve. */
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  /* Full traces in dev (free), a slice in production (cost + noise). */
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
