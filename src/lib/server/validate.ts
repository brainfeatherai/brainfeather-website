import 'server-only';

/* ────────────────────────────────────────────────────────────────
   Request validation for /api/v1/*.

   Hand-rolled rather than Zod: the repo has no schema library, and
   adding a dependency for nine routes of flat field checks is not worth
   the install. If the surface grows past this, Zod earns its place.

   Every enum here MUST match the Appwrite collection's enum attribute.
   A value this file accepts but the schema rejects becomes a 500 at the
   database instead of a 400 at the door.
   ──────────────────────────────────────────────────────────────── */

export const CATEGORIES = [
  'preference',
  'context',
  'decision',
  'code',
  'project',
  'team',
] as const;

export const SOURCES = [
  'manual',
  'chatgpt',
  'claude',
  'cursor',
  'slack',
  'chrome',
  'opencode',
  'codex',
  'antigravity',
] as const;

export const ENTITY_TYPES = [
  'tool',
  'language',
  'concept',
  'person',
  'project',
  'pattern',
] as const;

export const EDGE_TYPES = [
  'supersedes',
  'related_to',
  'contradicts',
  'depends_on',
  'part_of',
  'uses',
  'mentioned_in',
] as const;

/** Parse a JSON body, returning null rather than throwing on garbage. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    // A JSON array or bare literal is valid JSON but not a valid payload.
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function str(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number } = {},
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: `${field} must be a string.` };
  const trimmed = value.trim();
  const { min = 1, max = 2000 } = opts;
  if (trimmed.length < min) {
    return { ok: false, error: `${field} must be at least ${min} characters.` };
  }
  if (trimmed.length > max) {
    return { ok: false, error: `${field} must be at most ${max} characters.` };
  }
  return { ok: true, value: trimmed };
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): { ok: true; value: T } | { ok: false; error: string } {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return { ok: false, error: `${field} must be one of: ${allowed.join(', ')}.` };
  }
  return { ok: true, value: value as T };
}

/** Clamped so a caller cannot ask for the whole table. */
export function limitOf(raw: string | null, fallback = 50, ceiling = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), ceiling);
}
