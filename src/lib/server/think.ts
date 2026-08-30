import 'server-only';

/* ────────────────────────────────────────────────────────────────
   think() — decides whether something is worth remembering.

   Ported from the MCP server so the logic lives in ONE place. It was
   client-side, which meant every future client (dashboard, Chrome
   extension, Slack bot) would have had to reimplement the same
   heuristics and would have drifted apart. Now the rules are enforced
   wherever a fact enters the system.

   The pipeline, in order:
     1. exact duplicate     — normalised string match
     2. semantic duplicate  — Jaccard ≥ 0.55
     3. junk                — greetings, meta-talk, transient state
     4. supersede           — refinement, label collision, contradiction
     5. store + extract entities + link edges

   Dedup runs BEFORE the junk filter on purpose: re-saving an existing
   fact should report "duplicate", not "rejected", even when the phrasing
   would trip a junk rule on its own.
   ──────────────────────────────────────────────────────────────── */

import { extractEntities } from './entities.ts';
import {
  findDuplicate,
  junkReason,
  planSupersedes,
  type MemoryType,
} from './memory-policy.ts';
export {
  detectMemoryType,
  findDuplicate,
  junkReason,
  jaccardSimilarity,
  planSupersedes,
  type MemoryType,
  type StoredFact,
} from './memory-policy.ts';
import {
  mergeMemoryMetadata,
  type MemoryProvenance,
  type TemporalType,
} from './memory-temporal.ts';
import { reportServerError } from './report-error.ts';
import {
  createMemory,
  getMemory,
  listActive,
  syncMentionEdges,
  supersede,
  upsertEntity,
} from './memory-store.ts';

export type Candidate = {
  content: string;
  category: string;
  source?: string;
  title?: string;
  projectId?: string;
  supersedesId?: string;
  observedAt?: string;
  validFrom?: string;
  validTo?: string;
  temporalType?: TemporalType;
  provenance?: MemoryProvenance;
  confidence?: number;
};

export type Decision =
  | { action: 'reject'; reason: string }
  | { action: 'duplicate'; id: string }
  | { action: 'add'; id: string; invalidated: string[]; reason: string };

export async function enrichMemory(
  userId: string,
  memoryId: string,
  content: string,
): Promise<void> {
  const names = extractEntities(content);
  const entities = await Promise.all(
    names.map((entity) => upsertEntity(userId, entity.name, entity.type)),
  );
  await syncMentionEdges(
    userId,
    memoryId,
    entities.map((entity) => entity.$id),
    content,
  );
}

async function enrichMemoryBestEffort(
  userId: string,
  memoryId: string,
  content: string,
): Promise<void> {
  try {
    await enrichMemory(userId, memoryId, content);
  } catch (err) {
    reportServerError(err, {
      operation: 'memory.enrich',
      userId,
      resourceId: memoryId,
    });
  }
}

function metadataOf(memory: { metadata?: string }): {
  intendedSupersedes?: string[];
} {
  try {
    const value = JSON.parse(memory.metadata ?? '{}') as Record<string, unknown>;
    const ids = value.intendedSupersedes ?? value.is;
    return {
      intendedSupersedes: Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === 'string')
        : undefined,
    };
  } catch {
    return {};
  }
}

async function finishSupersession(
  userId: string,
  replacementId: string,
  targetIds: string[],
  projectId?: string,
): Promise<void> {
  const targets = (
    await Promise.all(targetIds.map((id) => getMemory(userId, id, projectId)))
  ).filter((memory): memory is NonNullable<typeof memory> => memory !== null);

  if (targets.length !== targetIds.length) {
    throw new Error('Supersession target is missing or belongs to another project.');
  }

  const active = targets.filter((memory) => memory.status === 'active');
  const replacedElsewhere = targets.some(
    (memory) => memory.status === 'invalid' && memory.supersededBy !== replacementId,
  );
  if (replacedElsewhere) {
    throw new Error('Supersession target was already replaced by another memory.');
  }
  if (active.length) await supersede(active.map((memory) => memory.$id), replacementId);
  await Promise.all(
    targets.map((memory) =>
      syncMentionEdges(userId, memory.$id, []).catch((err) => {
        reportServerError(err, {
          operation: 'memory.close_superseded_links',
          userId,
          resourceId: memory.$id,
        });
      }),
    ),
  );
}

/* Order matters: a correction that also states a decision is a
   correction, because it has to be able to supersede the decision. */
function temporalTypeFor(type: MemoryType): TemporalType {
  if (type === 'decision' || type === 'correction') return 'decision';
  if (type === 'preference' || type === 'pattern') return 'preference';
  return 'state';
}

/* ── Pipeline ───────────────────────────────────────────────────── */

export async function think(userId: string, cand: Candidate): Promise<Decision> {
  const content = cand.content.replace(/\s+/g, ' ').trim();
  const nowMs = Date.now();
  const observedAt = cand.observedAt ?? new Date(nowMs).toISOString();
  const validFrom = cand.validFrom ?? observedAt;
  const currentlyValid =
    Date.parse(validFrom) <= nowMs &&
    (cand.validTo === undefined || nowMs < Date.parse(cand.validTo));

  if (!currentlyValid && cand.supersedesId) {
    return {
      action: 'reject',
      reason: 'a historical memory cannot supersede current project truth',
    };
  }

  /* Compared against THIS project's facts, not every
     fact the user owns. Without the scope, saving "we use Postgres" in a
     second project was rejected as a duplicate of the first project's
     fact — refusing a genuinely project-specific decision. Dedup and
     contradiction detection both read from here, so both were affected. */
  const existing = await listActive(userId, {
    projectId: cand.projectId,
    strictScope: cand.projectId !== undefined,
    limit: 100,
  });

  // 1 + 2. Duplicates, before the junk filter (see header note).
  if (currentlyValid) {
    const dup = findDuplicate(content, existing, cand.supersedesId);
    if (dup) {
      if (cand.supersedesId === dup.$id) {
        return { action: 'reject', reason: 'a memory cannot supersede itself' };
      }
      const intended = new Set(metadataOf(dup).intendedSupersedes ?? []);
      if (cand.supersedesId) intended.add(cand.supersedesId);
      if (intended.size) {
        await finishSupersession(userId, dup.$id, [...intended], cand.projectId);
      }
      await enrichMemoryBestEffort(userId, dup.$id, dup.content);
      return { action: 'duplicate', id: dup.$id };
    }
  }

  /* Validate the explicit target after deduplication. If the first save
     committed but its HTTP response was lost, a safe retry sees the new
     fact as a duplicate even though the original target is now inactive. */
  const explicitTarget = cand.supersedesId
    ? await getMemory(userId, cand.supersedesId, cand.projectId)
    : undefined;
  if (cand.supersedesId && !explicitTarget) {
    return { action: 'reject', reason: 'supersedesId is not an active memory in this project' };
  }
  if (explicitTarget && explicitTarget.status !== 'active') {
    return { action: 'reject', reason: 'supersedesId is not an active memory in this project' };
  }

  // 3. Junk.
  const junk = junkReason(content);
  if (junk) return { action: 'reject', reason: junk };

  // 4. What does this replace?
  const planned = planSupersedes(content, existing, {
    projectId: cand.projectId,
    explicitTargetId: currentlyValid ? explicitTarget?.$id : undefined,
    currentlyValid,
  });
  if ('reject' in planned) return { action: 'reject', reason: planned.reject };

  const { doomed, type, reason } = planned;

  // 5. Store.
  const created = await createMemory(userId, {
    ...cand,
    content,
    metadata: mergeMemoryMetadata(undefined, {
      memoryType: type,
      confidence: cand.confidence ?? (cand.provenance?.type === 'user' ? 1 : 0.8),
      provenance: cand.provenance ?? { type: 'agent' },
      intendedSupersedes: doomed,
      observedAt,
      validFrom,
      ...(cand.validTo ? { validTo: cand.validTo } : {}),
      temporalType: cand.temporalType ?? temporalTypeFor(type),
    }),
    supersedeIds: doomed,
  });

  /* Enrichment remains best-effort: a graph failure must not roll back a
     fact that has already been accepted and stored. */
  if (currentlyValid) await enrichMemoryBestEffort(userId, created.$id, content);

  if (doomed.length) {
    await finishSupersession(userId, created.$id, doomed, cand.projectId);
  }

  return { action: 'add', id: created.$id, invalidated: doomed, reason };
}
