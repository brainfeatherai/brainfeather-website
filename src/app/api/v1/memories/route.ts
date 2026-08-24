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
import { think } from '@/lib/server/think';
import {
  CATEGORIES,
  SOURCES,
  limitOf,
  oneOf,
  readJson,
  str,
} from '@/lib/server/validate';

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const params = new URL(request.url).searchParams;

  const rawCategory = params.get('category');
  if (rawCategory) {
    const parsed = oneOf(rawCategory, CATEGORIES, 'category');
    if (!parsed.ok) return fail(400, parsed.error);
  }

  const memories = await listActive(auth.userId, {
    category: rawCategory ?? undefined,
    projectId: params.get('projectId') ?? undefined,
    limit: limitOf(params.get('limit')),
  });

  return Response.json({ memories, count: memories.length });
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = await readJson(request);
  if (!body) return fail(400, 'Body must be a JSON object.');

  const content = str(body.content, 'content', { min: 3, max: 2000 });
  if (!content.ok) return fail(400, content.error);

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

    const decision = await think(auth.userId, {
      content: content.value,
      category: category.value,
      source,
      title,
      projectId,
    });

    return Response.json(decision);
  } catch (err) {
    /* Most likely cause here is the collections granting no permissions,
       which surfaces as an Appwrite 401 the caller cannot act on. Log it
       server-side and return something honest. */
    console.error('[api/v1/memories] think failed:', err);
    return fail(500, 'Could not store the memory.');
  }
}
