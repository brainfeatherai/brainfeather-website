/* ────────────────────────────────────────────────────────────────
   /api/v1/stats

   Counts over active facts only, so the totals match what the dashboard
   and /context actually return. Counting retracted rows here would
   report a number the user cannot see anywhere else.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { listAllActive } from '@/lib/server/memory-store';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';

async function getStats(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const all = await listAllActive(auth.userId);

  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const m of all) {
    byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
    bySource[m.source] = (bySource[m.source] ?? 0) + 1;
  }

  return Response.json({ total: all.length, byCategory, bySource });
}

export const GET = withRequestTelemetry('stats.read', getStats);
