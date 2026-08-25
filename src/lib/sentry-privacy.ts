import type { Event } from "@sentry/nextjs";
import type * as Sentry from "@sentry/nextjs";

type SentryOptions = Parameters<typeof Sentry.init>[0];
type BeforeSendSpan = NonNullable<SentryOptions["beforeSendSpan"]>;
type SpanPayload = Parameters<BeforeSendSpan>[0];
type BeforeSendTransaction = NonNullable<SentryOptions["beforeSendTransaction"]>;
type TransactionPayload = Parameters<BeforeSendTransaction>[0];

const SAFE_TAGS = new Set([
  "operation",
  "route",
  "user_ref",
  "resource_ref",
  "entity_type",
  "edge_type",
  "depth",
  "strict_scope",
  "failed_count",
  "processed_count",
]);

/* Brainfeather processes private memory content and bearer credentials.
   Keep Sentry useful for stack traces and operational grouping without
   allowing automatic request instrumentation to copy customer data. */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
  frameContextLines: 0,
};

function safeTransactionName(name: string | undefined): string | undefined {
  if (!name) return name;
  const withoutQuery = name.split(/[?#]/, 1)[0];
  return withoutQuery
    .replace(/\/api\/v1\/memories\/[^/\s]+/g, "/api/v1/memories/:id")
    .replace(/\/api\/v1\/entities\/[^/\s]+/g, "/api/v1/entities/:id")
    .replace(/\/api\/v1\/edges\/[^/\s]+/g, "/api/v1/edges/:id")
    .replace(
      /\/api\/v1\/graph\/traverse\/[^/\s]+/g,
      "/api/v1/graph/traverse/:entityId",
    );
}

export function sanitizeSentrySpan(span: SpanPayload): SpanPayload {
  const safeData = Object.fromEntries(
    Object.entries(span.data).filter(([key]) =>
      ["sentry.op", "sentry.origin", "sentry.source", "sentry.sample_rate"].includes(key),
    ),
  );

  return {
    ...span,
    data: safeData,
    description: span.op ?? "operation",
    links: undefined,
  };
}

export function sanitizeSentryEvent<T extends Event>(event: T): T {
  delete event.user;
  delete event.request;
  delete event.breadcrumbs;
  delete event.extra;
  delete event.message;
  delete event.logentry;
  event.transaction = safeTransactionName(event.transaction);

  if (event.exception?.values) {
    for (const exception of event.exception.values) {
      if (
        exception.value !== "Sentry Example Frontend Error" &&
        !exception.value?.startsWith("Handled server failure:")
      ) {
        exception.value = "Application error";
      }
    }
  }

  if (event.tags) {
    event.tags = Object.fromEntries(
      Object.entries(event.tags).filter(([key]) => SAFE_TAGS.has(key)),
    );
  }

  delete event.contexts;
  if (event.spans) event.spans = event.spans.map(sanitizeSentrySpan);

  return event;
}

export function sanitizeSentryTransaction(event: TransactionPayload): TransactionPayload {
  return sanitizeSentryEvent(event);
}
