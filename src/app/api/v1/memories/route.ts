/* ────────────────────────────────────────────────────────────────
   /api/v1/memories

   GET  — list active facts
   POST — save a fact through think(), which may reject or dedupe it

   POST does not always create. The response `action` is the outcome:
   'add' | 'duplicate' | 'reject'. All three are 200, because none of
   them is a client error — being told "that is already stored" or "that
   is small talk" is a successful, useful answer. A 4xx would push
   callers into treating normal filtering as a failure to retry.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { listActive } from '@/lib/server/memory-store';
import { reportServerError } from '@/lib/server/report-error';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { think } from '@/lib/server/think';
import {
  CATEGORIES,
  SOURCES,
  limitOf,
  oneOf,
  readJson,
  secretReason,
  str,
  strictScopeOf,
} from '@/lib/server/validate';

async function listMemories(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const params = new URL(request.url).searchParams;
  const projectId = params.get('projectId') ?? undefined;
  const strictScope = strictScopeOf(params);
  if (strictScope && !projectId) return fail(400, 'strictScope requires projectId.');

  const rawCategory = params.get('category');
  if (rawCategory) {
    const parsed = oneOf(rawCategory, CATEGORIES, 'category');
    if (!parsed.ok) return fail(400, parsed.error);
  }

  const memories = await listActive(auth.userId, {
    category: rawCategory ?? undefined,
    projectId,
    strictScope,
    limit: limitOf(params.get('limit')),
  });

  return Response.json({ memories, count: memories.length });
}

async function createMemory(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = await readJson(request);
  if (!body) return fail(400, 'Body must be a JSON object.');

  const content = str(body.content, 'content', { min: 3, max: 2000 });
  if (!content.ok) return fail(400, content.error);
  const unsafe = secretReason(content.value);
  if (unsafe) return fail(400, `Refusing to store memory: ${unsafe}.`);

  const category = oneOf(body.category, CATEGORIES, 'category');
  if (!category.ok) return fail(400, category.error);

  let source: string | undefined;
  if (body.source !== undefined) {
    const parsed = oneOf(body.source, SOURCES, 'source');
    if (!parsed.ok) return fail(400, parsed.error);
    source = parsed.value;
  }

  let title: string | undefined;
  if (body.title !== undefined) {
    const parsed = str(body.title, 'title', { min: 1, max: 120 });
    if (!parsed.ok) return fail(400, parsed.error);
    title = parsed.value;
    const unsafe = secretReason(title);
    if (unsafe) return fail(400, `Refusing to store memory title: ${unsafe}.`);
  }

  try {
    /* userId comes from the token, never from the body. Trusting a
       body-supplied userId would let any valid key write into any
       other user's memory. */
    /* Length-checked against the Appwrite attribute, which is a 64-char
       string. An over-long value used to pass straight through and fail
       at the database as a 500 — the same class of drift as the `source`
       enum, where this layer accepted more than the schema allowed.
       Real ids overflow: a nested self-hosted remote measured 69 chars. */
    let projectId: string | undefined;
    if (body.projectId !== undefined) {
      const parsed = str(body.projectId, 'projectId', { min: 1, max: 64 });
      if (!parsed.ok) return fail(400, parsed.error);
      projectId = parsed.value;
    }

    let supersedesId: string | undefined;
    if (body.supersedesId !== undefined) {
      const parsed = str(body.supersedesId, 'supersedesId', { min: 1, max: 64 });
      if (!parsed.ok) return fail(400, parsed.error);
      supersedesId = parsed.value;
    }

    const provenance =
      body.provenance === undefined
        ? undefined
        : body.provenance === 'user_stated'
          ? 'user_stated'
          : null;
    if (provenance === null) return fail(400, 'provenance must be user_stated.');

    const decision = await think(auth.userId, {
      content: content.value,
      category: category.value,
      source,
      title,
      projectId,
      supersedesId,
      provenance,
    });

    return Response.json(decision);
  } catch (err) {
    /* Most likely cause here is the collections granting no permissions,
       which surfaces as an Appwrite 401 the caller cannot act on. Log it
       server-side and return something honest. */
    reportServerError(err, {
      operation: 'memory.create',
      route: '/api/v1/memories',
      userId: auth.userId,
    });
    return fail(500, 'Could not store the memory.');
  }
}

export const GET = withRequestTelemetry('memory.list', listMemories);
export const POST = withRequestTelemetry('memory.create', createMemory);
