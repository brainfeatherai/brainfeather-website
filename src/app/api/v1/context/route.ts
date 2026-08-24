/* ────────────────────────────────────────────────────────────────
   /api/v1/context

   The session-opening call. An agent asks this once, before it starts
   work, and gets everything it should already know about the project.

   Grouped rather than returned flat because the caller injects these
   into a prompt, where "decisions" and "conventions" carry different
   weight and want different framing. Regrouping a flat list client-side
   would mean every client reimplementing the same mapping.

   Compact by design: content strings only, no IDs or timestamps. This
   response goes into a context window, where every field costs tokens.
   Use /memories when you need the full records.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { listActive } from '@/lib/server/memory-store';

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const projectId = new URL(request.url).searchParams.get('projectId') ?? undefined;

  /* Only active facts. A superseded decision reaching a prompt is the
     precise failure this product claims to prevent. */
  const all = await listActive(auth.userId, { projectId, limit: 100 });

  const pick = (...categories: string[]) =>
    all.filter((m) => categories.includes(m.category)).map((m) => m.content);

  const facts = pick('context', 'project');
  const decisions = pick('decision');
  const patterns = pick('code', 'preference');

  return Response.json({
    facts,
    decisions,
    patterns,
    counts: {
      facts: facts.length,
      decisions: decisions.length,
      patterns: patterns.length,
      total: all.length,
    },
  });
}
