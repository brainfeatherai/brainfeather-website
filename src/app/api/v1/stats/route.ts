/* ────────────────────────────────────────────────────────────────
   /api/v1/stats

   Counts over active facts only, so the totals match what the dashboard
   and /context actually return. Counting retracted rows here would
   report a number the user cannot see anywhere else.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { listActive } from '@/lib/server/memory-store';

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const all = await listActive(auth.userId, { limit: 100 });

  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const m of all) {
    byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
    bySource[m.source] = (bySource[m.source] ?? 0) + 1;
  }

  return Response.json({ total: all.length, byCategory, bySource });
}
