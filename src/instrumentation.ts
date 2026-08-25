import * as Sentry from "@sentry/nextjs";

/* Next.js calls register() once per server process; the runtime guard
   picks the right config. This app runs everything on the Node runtime
   (no middleware, no edge routes), so there is deliberately no edge
   config to load. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

/* The step most setups miss: without this export, errors thrown in
   Server Components, Server Actions and route handlers are swallowed
   by Next and never reach Sentry — you would see a generic 500 in
   Vercel logs and nothing in the dashboard. */
export const onRequestError = Sentry.captureRequestError;
