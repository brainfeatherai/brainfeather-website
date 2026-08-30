/* ────────────────────────────────────────────────────────────────
   /api/v1/memories/search?q=…

   A static segment sitting beside `[id]`. The App Router matches static
   before dynamic, so this wins over /memories/search-as-an-id — but the
   two files must stay aware of each other: adding a memory whose ID is
   literally "search" would become unreachable through [id].
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { searchWithMeta } from '@/lib/server/memory-store';
import { memoryEvidence, metadataWithoutEvidenceDigest } from '@/lib/server/memory-temporal';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { CATEGORIES, dateTime, limitOf, memoryScope, oneOf, strictScopeOf } from '@/lib/server/validate';

async function searchMemories(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const params = new URL(request.url).searchParams;
  const parsedScope = memoryScope({
    projectId: params.get('projectId'),
    branch: params.get('branch'),
    taskId: params.get('taskId'),
  });
  if (!parsedScope.ok) return fail(400, parsedScope.error);
  const { projectId, branch, taskId } = parsedScope.value;
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

  const result = await searchWithMeta(auth.userId, q, {
    category: rawCategory ?? undefined,
    projectId,
    branch,
    taskId,
    strictScope,
    limit: limitOf(params.get('limit'), 10, 25),
    referenceAtMs,
  });
  const includeEvidence = params.get('includeEvidence') === 'true';
  const responseMemories = result.memories.map((memory) => ({
    ...memory,
    metadata: metadataWithoutEvidenceDigest(memory.metadata),
    ...(includeEvidence ? { evidence: memoryEvidence(memory.metadata) ?? null } : {}),
  }));

  return Response.json({
    memories: responseMemories,
    count: result.memories.length,
    query: q,
    truncated: result.truncated,
    scanned: result.scanned,
  });
}

export const runtime = 'nodejs';
export const GET = withRequestTelemetry('memory.search', searchMemories);
