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
import { listEntities, listProjectEntities, upsertEntity } from '@/lib/server/memory-store';
import { reportServerError } from '@/lib/server/report-error';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { ENTITY_TYPES, oneOf, readJson, secretReason, str } from '@/lib/server/validate';

async function listEntitiesRoute(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const rawType = new URL(request.url).searchParams.get('type');
  const params = new URL(request.url).searchParams;
  const projectId = params.get('projectId') ?? undefined;
  const strictScope = params.get('strictScope') === 'true';
  if (strictScope && !projectId) return fail(400, 'strictScope requires projectId.');
  if (rawType) {
    const parsed = oneOf(rawType, ENTITY_TYPES, 'type');
    if (!parsed.ok) return fail(400, parsed.error);
  }

  const entities =
    strictScope && projectId
      ? await listProjectEntities(auth.userId, projectId, rawType ?? undefined)
      : await listEntities(auth.userId, rawType ?? undefined);
  return Response.json({ entities, count: entities.length });
}

async function upsertEntityRoute(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = await readJson(request);
  if (!body) return fail(400, 'Body must be a JSON object.');

  const name = str(body.name, 'name', { min: 1, max: 100 });
  if (!name.ok) return fail(400, name.error);
  const unsafeName = secretReason(name.value);
  if (unsafeName) return fail(400, `Refusing to store entity name: ${unsafeName}.`);

  const type = oneOf(body.type, ENTITY_TYPES, 'type');
  if (!type.ok) return fail(400, type.error);

  let summary: string | undefined;
  if (body.summary !== undefined) {
    const parsed = str(body.summary, 'summary', { min: 1, max: 500 });
    if (!parsed.ok) return fail(400, parsed.error);
    summary = parsed.value;
    const unsafeSummary = secretReason(summary);
    if (unsafeSummary) return fail(400, `Refusing to store entity summary: ${unsafeSummary}.`);
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
    reportServerError(err, {
      operation: 'entity.upsert',
      route: '/api/v1/entities',
      userId: auth.userId,
      tags: { entity_type: type.value },
    });
    return fail(500, 'Could not save the entity.');
  }
}

export const GET = withRequestTelemetry('entity.list', listEntitiesRoute);
export const POST = withRequestTelemetry('entity.upsert', upsertEntityRoute);
