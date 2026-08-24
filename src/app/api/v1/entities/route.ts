/* ────────────────────────────────────────────────────────────────
   /api/v1/entities

   GET  — list tracked entities (tools, languages, concepts)
   POST — create or update one explicitly

   Entities are normally extracted automatically by think(), so POST is
   the escape hatch for something the known-entities map does not cover.
   It upserts rather than inserts: entity names are unique per user, so a
   repeat POST updates the summary instead of failing on a duplicate.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { listEntities, upsertEntity } from '@/lib/server/memory-store';
import { ENTITY_TYPES, oneOf, readJson, str } from '@/lib/server/validate';

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const rawType = new URL(request.url).searchParams.get('type');
  if (rawType) {
    const parsed = oneOf(rawType, ENTITY_TYPES, 'type');
    if (!parsed.ok) return fail(400, parsed.error);
  }

  const entities = await listEntities(auth.userId, rawType ?? undefined);
  return Response.json({ entities, count: entities.length });
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = await readJson(request);
  if (!body) return fail(400, 'Body must be a JSON object.');

  const name = str(body.name, 'name', { min: 1, max: 100 });
  if (!name.ok) return fail(400, name.error);

  const type = oneOf(body.type, ENTITY_TYPES, 'type');
  if (!type.ok) return fail(400, type.error);

  let summary: string | undefined;
  if (body.summary !== undefined) {
    const parsed = str(body.summary, 'summary', { min: 1, max: 500 });
    if (!parsed.ok) return fail(400, parsed.error);
    summary = parsed.value;
  }

  try {
    /* Names are lowercased so "Supabase" and "supabase" do not become two
       nodes — think() extracts lowercase, and a mixed-case POST would
       otherwise fork the entity. */
    const entity = await upsertEntity(
      auth.userId,
      name.value.toLowerCase(),
      type.value,
      summary,
    );
    return Response.json({ entity });
  } catch (err) {
    console.error('[api/v1/entities] upsert failed:', err);
    return fail(500, 'Could not save the entity.');
  }
}
