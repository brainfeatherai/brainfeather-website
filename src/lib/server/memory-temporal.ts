export const TEMPORAL_TYPES = [
  'state',
  'event',
  'plan',
  'preference',
  'decision',
  'absence',
] as const;

export const PROVENANCE_TYPES = [
  'user',
  'agent',
  'commit',
  'pull_request',
  'issue',
  'file',
  'deployment',
] as const;

export type TemporalType = (typeof TEMPORAL_TYPES)[number];
export type ProvenanceType = (typeof PROVENANCE_TYPES)[number];

export type MemoryProvenance = {
  type: ProvenanceType;
  reference?: string;
  digest?: string;
};

export type MemoryEvidence = MemoryProvenance;

export function isFileEvidenceDigest(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

export type NormalizedMemoryMetadata = {
  observedAt: string;
  validFrom: string;
  validTo?: string;
  invalidatedAt?: string;
  temporalType: TemporalType;
  confidence: number;
  provenance: MemoryProvenance;
  intendedSupersedes: string[];
};

function objectOf(raw?: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw ?? '{}');
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function provenanceValue(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  return {
    type: candidate.type ?? candidate.t,
    reference: candidate.reference ?? candidate.r,
    digest: candidate.digest ?? candidate.d,
  };
}

function iso(value: unknown): string | undefined {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function temporalTypeOf(value: unknown, memoryType: unknown): TemporalType {
  if (typeof value === 'string' && TEMPORAL_TYPES.includes(value as TemporalType)) {
    return value as TemporalType;
  }
  if (memoryType === 'decision') return 'decision';
  if (memoryType === 'preference') return 'preference';
  return 'state';
}

function provenanceOf(value: unknown): MemoryProvenance {
  if (value === 'user_stated') return { type: 'user' };
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.type === 'string' &&
      PROVENANCE_TYPES.includes(candidate.type as ProvenanceType)
    ) {
      return {
        type: candidate.type as ProvenanceType,
        ...(typeof candidate.reference === 'string' && candidate.reference
          ? { reference: candidate.reference }
          : {}),
      };
    }
  }
  return { type: 'agent' };
}

export function memoryEvidence(raw: string | undefined): MemoryEvidence | undefined {
  const value = objectOf(raw);
  const candidate = provenanceValue(value.provenance ?? value.p);
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return undefined;
  }
  const evidence = candidate as Record<string, unknown>;
  if (
    typeof evidence.type !== 'string' ||
    !PROVENANCE_TYPES.includes(evidence.type as ProvenanceType)
  ) {
    return undefined;
  }
  return {
    type: evidence.type as ProvenanceType,
    ...(typeof evidence.reference === 'string' && evidence.reference
      ? { reference: evidence.reference }
      : {}),
    ...(evidence.type === 'file' && isFileEvidenceDigest(evidence.digest)
      ? { digest: evidence.digest }
      : {}),
  };
}

export function metadataWithoutEvidenceDigest(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const value = objectOf(raw);
  const key = value.provenance !== undefined ? 'provenance' : value.p !== undefined ? 'p' : null;
  if (!key) return raw;
  const provenance = value[key];
  if (typeof provenance !== 'object' || provenance === null || Array.isArray(provenance)) {
    return raw;
  }
  const sanitized = { ...(provenance as Record<string, unknown>) };
  const hadDigest = 'digest' in sanitized || 'd' in sanitized;
  if (!hadDigest) return raw;
  delete sanitized.digest;
  delete sanitized.d;
  return JSON.stringify({ ...value, [key]: sanitized });
}

export function normalizeMemoryMetadata(
  raw: string | undefined,
  createdAt: string,
): NormalizedMemoryMetadata {
  const value = objectOf(raw);
  const observedAt = iso(value.observedAt ?? value.oa) ?? new Date(createdAt).toISOString();
  const validFrom = iso(value.validFrom ?? value.vf) ?? observedAt;
  const confidence =
    typeof (value.confidence ?? value.c) === 'number' &&
    Number.isFinite(value.confidence ?? value.c)
      ? Math.max(0, Math.min(1, (value.confidence ?? value.c) as number))
      : 0.8;
  const supersedes = value.intendedSupersedes ?? value.is;

  return {
    observedAt,
    validFrom,
    ...(iso(value.validTo ?? value.vt) ? { validTo: iso(value.validTo ?? value.vt)! } : {}),
    ...(iso(value.invalidatedAt ?? value.ia)
      ? { invalidatedAt: iso(value.invalidatedAt ?? value.ia)! }
      : {}),
    temporalType: temporalTypeOf(value.temporalType ?? value.tt, value.memoryType ?? value.mt),
    confidence,
    provenance: provenanceOf(provenanceValue(value.provenance ?? value.p)),
    intendedSupersedes: Array.isArray(supersedes)
      ? supersedes.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

const KNOWN_KEYS = new Set([
  'version', 'v', 'memoryType', 'mt', 'confidence', 'c', 'provenance', 'p',
  'intendedSupersedes', 'is', 'observedAt', 'oa', 'validFrom', 'vf',
  'validTo', 'vt', 'invalidatedAt', 'ia', 'temporalType', 'tt',
]);

function compactMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const extra = Object.fromEntries(
    Object.entries(value).filter(([key]) => !KNOWN_KEYS.has(key)),
  );
  const provenance = provenanceValue(value.provenance ?? value.p) as
    | Record<string, unknown>
    | undefined;
  const memoryType = value.memoryType ?? value.mt;
  const confidence = value.confidence ?? value.c;
  const supersedes = value.intendedSupersedes ?? value.is;
  const observedAt = value.observedAt ?? value.oa;
  const validFrom = value.validFrom ?? value.vf;
  const validTo = value.validTo ?? value.vt;
  const invalidatedAt = value.invalidatedAt ?? value.ia;
  const temporalType = value.temporalType ?? value.tt;
  return {
    ...extra,
    v: 2,
    ...(memoryType ? { mt: memoryType } : {}),
    ...(confidence !== undefined ? { c: confidence } : {}),
    ...(provenance?.type
      ? {
          p: {
            t: provenance.type,
            ...(provenance.reference ? { r: provenance.reference } : {}),
            ...(provenance.digest ? { d: provenance.digest } : {}),
          },
        }
      : {}),
    ...(Array.isArray(supersedes) ? { is: supersedes } : {}),
    ...(observedAt ? { oa: observedAt } : {}),
    ...(validFrom ? { vf: validFrom } : {}),
    ...(validTo ? { vt: validTo } : {}),
    ...(invalidatedAt ? { ia: invalidatedAt } : {}),
    ...(temporalType ? { tt: temporalType } : {}),
  };
}

export function mergeMemoryMetadata(
  raw: string | undefined,
  patch: Record<string, unknown>,
): string {
  return JSON.stringify(compactMetadata({ ...objectOf(raw), ...patch }));
}

export function hasExplicitValidityEnd(raw: string | undefined): boolean {
  const value = objectOf(raw);
  return iso(value.validTo ?? value.vt) !== undefined;
}

export function invalidateMemoryMetadata(
  raw: string | undefined,
  invalidatedAt: string,
  validTo = invalidatedAt,
): string {
  return mergeMemoryMetadata(raw, { invalidatedAt, validTo });
}

export function reviveMemoryMetadata(raw: string | undefined): string {
  const value = objectOf(raw);
  delete value.validTo;
  delete value.vt;
  delete value.invalidatedAt;
  delete value.ia;
  return JSON.stringify(compactMetadata(value));
}

export function isValidAt(
  metadata: NormalizedMemoryMetadata,
  referenceAtMs: number,
): boolean {
  const validFromMs = Date.parse(metadata.validFrom);
  const validToMs = metadata.validTo ? Date.parse(metadata.validTo) : Number.POSITIVE_INFINITY;
  return referenceAtMs >= validFromMs && referenceAtMs < validToMs;
}

export function memoryIsVisibleAt(
  memory: { status: 'active' | 'invalid'; metadata?: string; $createdAt: string },
  referenceAtMs: number,
): boolean {
  if (memory.status === 'invalid' && !hasExplicitValidityEnd(memory.metadata)) return false;
  return isValidAt(normalizeMemoryMetadata(memory.metadata, memory.$createdAt), referenceAtMs);
}
