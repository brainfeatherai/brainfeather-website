import 'server-only';

import { createHmac } from 'node:crypto';
import { Query, type Models } from 'node-appwrite';
import { adminTables, COLLECTIONS, DATABASE_ID } from './appwrite-admin.ts';

let warnedAboutSharedSecret = false;

/* Prefers a dedicated secret so one leaked value does not cover both
   session signing and rate-limit bucketing.

   The fallback to BRAINFEATHER_SESSION_SECRET stays because
   BRAINFEATHER_RATE_LIMIT_SECRET is scoped to Production only in Vercel,
   while the session secret is scoped to Production and Preview. Without
   the fallback this throws on every preview deployment, and since the
   waitlist and register routes rate-limit before doing anything else,
   that fails those forms closed on exactly the deployments meant for
   review. Scope the dedicated secret to Preview and this fallback stops
   being reachable. */
function rateLimitSecret(): string {
  const dedicated = process.env.BRAINFEATHER_RATE_LIMIT_SECRET || '';
  if (dedicated.length >= 32) return dedicated;

  const shared = process.env.BRAINFEATHER_SESSION_SECRET || '';
  if (shared.length >= 32) {
    if (!warnedAboutSharedSecret) {
      warnedAboutSharedSecret = true;
      console.warn(
        '[brainfeather] Rate-limit bucketing is reusing BRAINFEATHER_SESSION_SECRET. ' +
          'Set BRAINFEATHER_RATE_LIMIT_SECRET (32+ chars) for this environment.',
      );
    }
    return shared;
  }

  throw new Error('Public rate-limit signing is not configured.');
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
