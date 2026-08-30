import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invalidateMemoryMetadata,
  isFileEvidenceDigest,
  isValidAt,
  memoryIsRetrievable,
  memoryIsVisibleAt,
  memoryEvidence,
  metadataWithoutEvidenceDigest,
  mergeMemoryMetadata,
  normalizeMemoryMetadata,
  reviveMemoryMetadata,
} from './memory-temporal.ts';

const CREATED = '2026-01-01T00:00:00.000Z';

test('normalizes legacy metadata without losing historical defaults', () => {
  const metadata = normalizeMemoryMetadata(
    JSON.stringify({
      memoryType: 'decision',
      confidence: 1,
      provenance: 'user_stated',
      intendedSupersedes: ['memory-1'],
    }),
    CREATED,
  );

  assert.deepEqual(metadata, {
    observedAt: CREATED,
    validFrom: CREATED,
    temporalType: 'decision',
    confidence: 1,
    provenance: { type: 'user' },
    intendedSupersedes: ['memory-1'],
  });
});

test('preserves unknown metadata while adding versioned temporal fields', () => {
  const merged = JSON.parse(
    mergeMemoryMetadata(JSON.stringify({ memoryType: 'fact', custom: 'kept' }), {
      observedAt: CREATED,
      validFrom: CREATED,
      temporalType: 'state',
      provenance: { type: 'commit', reference: 'abc123' },
    }),
  );
  assert.equal(merged.v, 2);
  assert.equal(merged.custom, 'kept');
  assert.equal(merged.p.r, 'abc123');
  assert.equal(merged.oa, CREATED);
});

test('tracks invalidation and revival without relying on database timestamps', () => {
  const invalidated = invalidateMemoryMetadata(
    JSON.stringify({ observedAt: CREATED, validFrom: CREATED }),
    '2026-02-01T00:00:00.000Z',
  );
  const normalized = normalizeMemoryMetadata(invalidated, CREATED);
  assert.equal(isValidAt(normalized, Date.parse('2026-01-15T00:00:00Z')), true);
  assert.equal(isValidAt(normalized, Date.parse('2026-02-01T00:00:00Z')), false);

  const revived = normalizeMemoryMetadata(reviveMemoryMetadata(invalidated), CREATED);
  assert.equal(revived.validTo, undefined);
  assert.equal(revived.invalidatedAt, undefined);
});

test('uses explicit event validity independently from observation time', () => {
  const metadata = normalizeMemoryMetadata(
    JSON.stringify({
      observedAt: '2026-03-10T00:00:00Z',
      validFrom: '2026-02-01T00:00:00Z',
      validTo: '2026-03-01T00:00:00Z',
      temporalType: 'event',
      confidence: 0.9,
      provenance: { type: 'file', reference: 'docs/history.md' },
    }),
    CREATED,
  );
  assert.equal(isValidAt(metadata, Date.parse('2026-02-15T00:00:00Z')), true);
  assert.equal(isValidAt(metadata, Date.parse('2026-03-05T00:00:00Z')), false);
  assert.equal(metadata.observedAt, '2026-03-10T00:00:00.000Z');
});

test('fails closed for legacy invalid rows with no trustworthy validity end', () => {
  assert.equal(
    memoryIsVisibleAt(
      { status: 'invalid', metadata: '{}', $createdAt: CREATED },
      Date.parse('2026-01-15T00:00:00Z'),
    ),
    false,
  );
});

test('keeps an invalidated row visible until its explicit validity end', () => {
  const metadata = invalidateMemoryMetadata(
    JSON.stringify({ observedAt: CREATED, validFrom: CREATED }),
    '2026-01-10T00:00:00Z',
    '2026-02-01T00:00:00Z',
  );
  assert.equal(
    memoryIsVisibleAt(
      { status: 'invalid', metadata, $createdAt: CREATED },
      Date.parse('2026-01-15T00:00:00Z'),
    ),
    true,
  );
});

test('hides active rows before validFrom and after validTo', () => {
  const metadata = JSON.stringify({
    vf: '2026-02-01T00:00:00Z',
    vt: '2026-03-01T00:00:00Z',
  });
  const row = { status: 'active' as const, metadata, $createdAt: CREATED };
  assert.equal(memoryIsVisibleAt(row, Date.parse('2026-01-15T00:00:00Z')), false);
  assert.equal(memoryIsVisibleAt(row, Date.parse('2026-02-15T00:00:00Z')), true);
  assert.equal(memoryIsVisibleAt(row, Date.parse('2026-03-15T00:00:00Z')), false);
});

test('enforces strict project and temporal retrieval boundaries', () => {
  const referenceAtMs = Date.parse('2026-02-15T00:00:00Z');
  const scoped = {
    status: 'active' as const,
    $createdAt: CREATED,
    projectId: 'github.com/acme/api',
  };
  assert.equal(
    memoryIsRetrievable(scoped, {
      projectId: 'github.com/acme/api',
      strictScope: true,
      referenceAtMs,
    }),
    true,
  );
  assert.equal(
    memoryIsRetrievable(scoped, {
      projectId: 'github.com/acme/storefront',
      strictScope: true,
      referenceAtMs,
    }),
    false,
  );
  assert.equal(
    memoryIsRetrievable(
      { ...scoped, metadata: JSON.stringify({ vt: '2026-02-01T00:00:00Z' }) },
      { projectId: scoped.projectId, strictScope: true, referenceAtMs },
    ),
    false,
  );
});

test('includes unscoped memories only in compatibility scope', () => {
  const memory = { status: 'active' as const, $createdAt: CREATED };
  const options = {
    projectId: 'github.com/acme/api',
    referenceAtMs: Date.parse('2026-02-15T00:00:00Z'),
  };
  assert.equal(memoryIsRetrievable(memory, options), true);
  assert.equal(memoryIsRetrievable(memory, { ...options, strictScope: true }), false);
});

test('normalizes compact provenance and temporal keys', () => {
  const metadata = normalizeMemoryMetadata(
    JSON.stringify({
      v: 2,
      mt: 'decision',
      c: 0.95,
      p: { t: 'commit', r: 'abc123' },
      is: ['memory-1'],
      oa: '2026-03-10T00:00:00Z',
      vf: '2026-03-01T00:00:00Z',
      tt: 'decision',
    }),
    CREATED,
  );
  assert.deepEqual(metadata, {
    observedAt: '2026-03-10T00:00:00.000Z',
    validFrom: '2026-03-01T00:00:00.000Z',
    temporalType: 'decision',
    confidence: 0.95,
    provenance: { type: 'commit', reference: 'abc123' },
    intendedSupersedes: ['memory-1'],
  });
});

test('stores file digests compactly without exposing them in temporal provenance', () => {
  const raw = mergeMemoryMetadata(undefined, {
    provenance: {
      type: 'file',
      reference: 'docs/architecture.md',
      digest: `sha256:${'a'.repeat(64)}`,
    },
  });
  const compact = JSON.parse(raw);
  assert.equal(compact.p.d, `sha256:${'a'.repeat(64)}`);
  assert.deepEqual(normalizeMemoryMetadata(raw, CREATED).provenance, {
    type: 'file',
    reference: 'docs/architecture.md',
  });
  assert.deepEqual(memoryEvidence(raw), {
    type: 'file',
    reference: 'docs/architecture.md',
    digest: `sha256:${'a'.repeat(64)}`,
  });
  assert.deepEqual(JSON.parse(metadataWithoutEvidenceDigest(raw)!), {
    v: 2,
    p: { t: 'file', r: 'docs/architecture.md' },
  });
});

test('does not rewrite metadata that has no evidence digest', () => {
  const raw = JSON.stringify({ v: 2, p: { t: 'commit', r: 'abc123' } });
  assert.equal(metadataWithoutEvidenceDigest(raw), raw);
});

test('accepts only canonical lowercase SHA-256 evidence digests', () => {
  assert.equal(isFileEvidenceDigest(`sha256:${'a'.repeat(64)}`), true);
  assert.equal(isFileEvidenceDigest(`sha256:${'A'.repeat(64)}`), false);
  assert.equal(isFileEvidenceDigest(`sha1:${'a'.repeat(64)}`), false);
  assert.equal(isFileEvidenceDigest(`sha256:${'a'.repeat(63)}`), false);
});

test('omits malformed or non-file digests from recalled evidence', () => {
  assert.deepEqual(
    memoryEvidence(JSON.stringify({ p: { t: 'file', r: 'README.md', d: 'bad' } })),
    { type: 'file', reference: 'README.md' },
  );
  assert.deepEqual(
    memoryEvidence(JSON.stringify({ p: { t: 'commit', r: 'abc123', d: `sha256:${'a'.repeat(64)}` } })),
    { type: 'commit', reference: 'abc123' },
  );
});
