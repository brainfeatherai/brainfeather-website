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

const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  {
    name: 'Brainfeather API key',
    pattern: /\bbf_(?:(?:live|test)_[A-Za-z0-9]{16,128}|[A-Fa-f0-9]{16,128})\b/,
  },
  { name: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: 'OpenAI API key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  {
    name: 'assigned credential',
    pattern:
      /\b(?:password|passwd|secret|api[_ -]?key|access[_ -]?token|auth[_ -]?token)\b\s*[:=]\s*["']?[^\s"']{8,}/i,
  },
  { name: 'credential-bearing URL', pattern: /https?:\/\/[^\s/@:]+:[^\s/@]+@/i },
  { name: 'email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { name: 'US Social Security number', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'payment card number', pattern: /\b(?:\d[ -]*?){13,19}\b/ },
];

export function secretReason(value: string): string | null {
  const match = SECRET_PATTERNS.find(({ pattern }) => pattern.test(value));
  return match ? `content contains sensitive data (${match.name})` : null;
}

export function strictScopeOf(params: URLSearchParams): boolean {
  return params.get('strictScope') === 'true';
}

export function dateTime(
  value: unknown,
  field: string,
): { ok: true; value: string; ms: number } | { ok: false; error: string } {
  if (typeof value !== 'string' || value.length > 64) {
    return { ok: false, error: `${field} must be an ISO 8601 date-time.` };
  }
  const trimmed = value.trim();
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(trimmed) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)
  ) {
    return { ok: false, error: `${field} must include a date, time and timezone.` };
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    return { ok: false, error: `${field} must be a valid ISO 8601 date-time.` };
  }
  return { ok: true, value: new Date(ms).toISOString(), ms };
}

export function boundedInt(
  value: string | null,
  field: string,
  opts: { min: number; max: number; fallback: number },
): { ok: true; value: number } | { ok: false; error: string } {
  if (value === null || value === '') return { ok: true, value: opts.fallback };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < opts.min || parsed > opts.max) {
    return {
      ok: false,
      error: `${field} must be an integer from ${opts.min} to ${opts.max}.`,
    };
  }
  return { ok: true, value: parsed };
}

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
