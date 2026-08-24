/* ────────────────────────────────────────────────────────────────
   /api/v1/memories/search?q=…

   A static segment sitting beside `[id]`. The App Router matches static
   before dynamic, so this wins over /memories/search-as-an-id — but the
   two files must stay aware of each other: adding a memory whose ID is
   literally "search" would become unreachable through [id].
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { search } from '@/lib/server/memory-store';
import { CATEGORIES, limitOf, oneOf } from '@/lib/server/validate';

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const params = new URL(request.url).searchParams;
  const q = params.get('q') ?? params.get('query');
  if (!q) return fail(400, 'Missing required query parameter: q');

  const rawCategory = params.get('category');
  if (rawCategory) {
    const parsed = oneOf(rawCategory, CATEGORIES, 'category');
    if (!parsed.ok) return fail(400, parsed.error);
  }

  const memories = await search(auth.userId, q, {
    category: rawCategory ?? undefined,
    projectId: params.get('projectId') ?? undefined,
    limit: limitOf(params.get('limit'), 10, 25),
  });

  return Response.json({ memories, count: memories.length, query: q });
}
