import "server-only";

import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";

type SafeTagValue = string | number | boolean | null | undefined;

type ReportContext = {
  operation: string;
  route?: string;
  userId?: string;
  resourceId?: string;
  tags?: Record<string, SafeTagValue>;
};

function opaque(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/* Never pass request objects, content, titles, emails or raw IDs here.
   The type accepts only known operational fields and scalar tags. */
export function reportServerError(error: unknown, context: ReportContext): string {
  const normalized = new Error(`Handled server failure: ${context.operation}`);
  if (error instanceof Error && error.stack) {
    normalized.stack = [normalized.toString(), ...error.stack.split("\n").slice(1)].join("\n");
  }

  const eventId = Sentry.withScope((scope) => {
    scope.setTag("operation", context.operation);
    if (context.route) scope.setTag("route", context.route);
    if (context.userId) scope.setTag("user_ref", opaque(context.userId));
    if (context.resourceId) scope.setTag("resource_ref", opaque(context.resourceId));

    for (const [key, value] of Object.entries(context.tags ?? {})) {
      if (value !== null && value !== undefined) scope.setTag(key, value);
    }

    return Sentry.captureException(normalized);
  });

  console.error(`[${context.operation}] captured by Sentry as ${eventId}`);
  return eventId;
}
