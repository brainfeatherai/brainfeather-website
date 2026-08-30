import 'server-only';

import { createHmac } from 'node:crypto';
import { Query, type Models } from 'node-appwrite';
import { adminTables, COLLECTIONS, DATABASE_ID } from './appwrite-admin.ts';

function rateLimitSecret(): string {
  const secret =
    process.env.BRAINFEATHER_RATE_LIMIT_SECRET ||
    process.env.BRAINFEATHER_SESSION_SECRET ||
    '';
  if (secret.length < 32) throw new Error('Public rate-limit signing is not configured.');
  return secret;
}

export function rateLimitRowId(
  scope: string,
  address: string,
  windowStart: number,
  secret = rateLimitSecret(),
): string {
  return createHmac('sha256', secret)
    .update(`${scope}\0${address}\0${windowStart}`)
    .digest('hex')
    .slice(0, 36);
}

export async function consumePublicRateLimit(
  scope: string,
  address: string,
  opts: { limit?: number; windowMs?: number } = {},
): Promise<boolean> {
  const limit = opts.limit ?? 5;
  const windowMs = opts.windowMs ?? 60 * 60 * 1000;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const rowId = rateLimitRowId(scope, address || 'unknown', windowStart);

  await adminTables.deleteRows({
    databaseId: DATABASE_ID,
    tableId: COLLECTIONS.publicRateLimits,
    queries: [Query.lessThanEqual('expiresAt', new Date(now).toISOString())],
  }).catch(() => {});

  try {
    await adminTables.createRow({
      databaseId: DATABASE_ID,
      tableId: COLLECTIONS.publicRateLimits,
      rowId,
      data: {
        scope,
        count: 1,
        expiresAt: new Date(windowStart + windowMs).toISOString(),
      },
      permissions: [],
    });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code !== 409) throw error;
  }

  try {
    await adminTables.incrementRowColumn({
      databaseId: DATABASE_ID,
      tableId: COLLECTIONS.publicRateLimits,
      rowId,
      column: 'count',
      value: 1,
      max: limit,
    });
    return true;
  } catch (error) {
    try {
      const row = await adminTables.getRow<{ count: number } & Models.Row>({
        databaseId: DATABASE_ID,
        tableId: COLLECTIONS.publicRateLimits,
        rowId,
      });
      if (row.count >= limit) return false;
    } catch {
      /* Preserve the original increment failure below. */
    }
    throw error;
  }
}
