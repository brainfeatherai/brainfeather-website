/* ────────────────────────────────────────────────────────────────
   /api/v1/memories/search?q=…

   A static segment sitting beside `[id]`. The App Router matches static
   before dynamic, so this wins over /memories/search-as-an-id — but the
   two files must stay aware of each other: adding a memory whose ID is
   literally "search" would become unreachable through [id].
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { search } from '@/lib/server/memory-store';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { CATEGORIES, dateTime, limitOf, oneOf, strictScopeOf } from '@/lib/server/validate';

async function searchMemories(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const params = new URL(request.url).searchParams;
  const projectId = params.get('projectId') ?? undefined;
  const strictScope = strictScopeOf(params);
  if (strictScope && !projectId) return fail(400, 'strictScope requires projectId.');
  const q = params.get('q') ?? params.get('query');
  if (!q) return fail(400, 'Missing required query parameter: q');
  let referenceAtMs: number | undefined;
  const rawReferenceAt = params.get('referenceAt');
  if (rawReferenceAt) {
    const parsed = dateTime(rawReferenceAt, 'referenceAt');
    if (!parsed.ok) return fail(400, parsed.error);
    referenceAtMs = parsed.ms;
  }

  const rawCategory = params.get('category');
  if (rawCategory) {
    const parsed = oneOf(rawCategory, CATEGORIES, 'category');
    if (!parsed.ok) return fail(400, parsed.error);
  }

  const memories = await search(auth.userId, q, {
    category: rawCategory ?? undefined,
    projectId,
    strictScope,
    limit: limitOf(params.get('limit'), 10, 25),
    referenceAtMs,
  });

  return Response.json({ memories, count: memories.length, query: q });
}

export const GET = withRequestTelemetry('memory.search', searchMemories);
