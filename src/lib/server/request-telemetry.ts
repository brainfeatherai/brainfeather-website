import 'server-only';

import { ID, Query, type Models } from 'node-appwrite';
import { after } from 'next/server';
import { authenticate, fail, type AuthResult } from './api-auth';
import { adminDb, adminTables, COLLECTIONS, DATABASE_ID } from './appwrite-admin';

type AuthSuccess = Extract<AuthResult, { ok: true }>;

export type RequestMetric = Models.Row & {
  userId: string;
  keyId: string;
  operation: string;
  method: string;
  status: number;
  durationMs: number;
  occurredAt: string;
};

export type RequestAnalytics = {
  configured: boolean;
  windowDays: number;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  successRate: number;
  averageDurationMs: number;
  p95DurationMs: number;
  capped: boolean;
  byOperation: { operation: string; count: number; averageDurationMs: number }[];
  recent: (Pick<
    RequestMetric,
    '$id' | '$createdAt' | 'operation' | 'method' | 'status' | 'durationMs' | 'occurredAt'
  > & { keyName: string })[];
};

function isMissingTelemetryTable(error: unknown): boolean {
  const value = error as { code?: number; type?: string; message?: string };
  return (
    value.code === 404 ||
    value.type === 'collection_not_found' ||
    /collection.*not found|table.*not found/i.test(value.message ?? '')
  );
}

async function recordApiRequest(input: {
  userId: string;
  keyId: string;
  operation: string;
  method: string;
  status: number;
  durationMs: number;
}): Promise<void> {
  await adminTables.createRow({
    databaseId: DATABASE_ID,
    tableId: COLLECTIONS.apiRequests,
    rowId: ID.unique(),
    data: {
      ...input,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      occurredAt: new Date().toISOString(),
    },
    permissions: [],
  });
}

export async function withAuthenticatedRequest(
  request: Request,
  operation: string,
  run: (auth: AuthSuccess) => Response | Promise<Response>,
): Promise<Response> {
  const startedAt = performance.now();
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  let status = 500;
  let durationMs = 0;

  if (auth.credential === 'apiKey' && auth.keyId) {
    after(async () => {
      try {
        await recordApiRequest({
          userId: auth.userId,
          keyId: auth.keyId!,
          operation,
          method: request.method,
          status,
          durationMs,
        });
      } catch (error) {
        if (!isMissingTelemetryTable(error)) {
          console.error(`[request.telemetry] failed to record ${operation}`);
        }
      }
    });
  }

  try {
    const response = await run(auth);
    status = response.status;
    return response;
  } finally {
    durationMs = performance.now() - startedAt;
  }
}

type RouteHandler<Args extends unknown[]> = (
  request: Request,
  ...args: Args
) => Response | Promise<Response>;

export function withRequestTelemetry<Args extends unknown[]>(
  operation: string,
  handler: RouteHandler<Args>,
): RouteHandler<Args> {
  return async (request, ...args) =>
    withAuthenticatedRequest(request, operation, () => handler(request, ...args));
}

export async function readRequestAnalytics(
  userId: string,
  windowDays = 30,
): Promise<RequestAnalytics> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  let rows: RequestMetric[];

  try {
    const result = await adminTables.listRows<RequestMetric>({
      databaseId: DATABASE_ID,
      tableId: COLLECTIONS.apiRequests,
      queries: [
        Query.equal('userId', userId),
        Query.greaterThanEqual('occurredAt', since),
        Query.orderDesc('occurredAt'),
        Query.limit(500),
      ],
      total: false,
    });
    rows = result.rows;
  } catch (error) {
    if (!isMissingTelemetryTable(error)) throw error;
    return {
      configured: false,
      windowDays,
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      successRate: 0,
      averageDurationMs: 0,
      p95DurationMs: 0,
      capped: false,
      byOperation: [],
      recent: [],
    };
  }

  const successfulCalls = rows.filter((row) => row.status >= 200 && row.status < 400).length;
  const durations = rows.map((row) => row.durationMs).sort((a, b) => a - b);
  const averageDurationMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;
  const p95DurationMs = durations.length
    ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)]
    : 0;
  const operationGroups = new Map<string, number[]>();
  for (const row of rows) {
    const values = operationGroups.get(row.operation) ?? [];
    values.push(row.durationMs);
    operationGroups.set(row.operation, values);
  }

  const keyIds = [...new Set(rows.slice(0, 100).map((row) => row.keyId))];
  const keyNames = new Map<string, string>();
  await Promise.all(
    keyIds.map(async (keyId) => {
      try {
        const row = await adminDb.getDocument(DATABASE_ID, COLLECTIONS.apiKeys, keyId);
        keyNames.set(keyId, typeof row.name === 'string' ? row.name : 'Unknown key');
      } catch {
        keyNames.set(keyId, 'Revoked key');
      }
    }),
  );

  return {
    configured: true,
    windowDays,
    totalCalls: rows.length,
    successfulCalls,
    failedCalls: rows.length - successfulCalls,
    successRate: rows.length ? Math.round((successfulCalls / rows.length) * 1000) / 10 : 0,
    averageDurationMs,
    p95DurationMs,
    capped: rows.length >= 500,
    byOperation: [...operationGroups.entries()]
      .map(([operation, values]) => ({
        operation,
        count: values.length,
        averageDurationMs: Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        ),
      }))
      .sort((a, b) => b.count - a.count),
    recent: rows.slice(0, 100).map((row) => ({
      $id: row.$id,
      $createdAt: row.$createdAt,
      operation: row.operation,
      method: row.method,
      status: row.status,
      durationMs: row.durationMs,
      occurredAt: row.occurredAt,
      keyName: keyNames.get(row.keyId) ?? 'Unknown key',
    })),
  };
}
