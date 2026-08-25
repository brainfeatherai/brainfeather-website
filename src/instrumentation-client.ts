import * as Sentry from "@sentry/nextjs";
import {
  SENTRY_DATA_COLLECTION,
  sanitizeSentryEvent,
  sanitizeSentrySpan,
  sanitizeSentryTransaction,
} from "@/lib/sentry-privacy";

/* Browser-side init. Runs before any client code. No-op without a DSN.

   Session Replay is intentionally OFF: the dashboard renders users'
   private memory content, and replaying that to a third party — even
   masked — is a data-relationship decision, not a checkbox. Revisit
   with explicit masking and a privacy-policy update if wanted. */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  dataCollection: SENTRY_DATA_COLLECTION,
  beforeSend: sanitizeSentryEvent,
  beforeSendTransaction: sanitizeSentryTransaction,
  beforeSendSpan: sanitizeSentrySpan,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});

/* Makes client-side navigations their own transactions. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
