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

import { extractEntities } from './entities';
import {
  mergeMemoryMetadata,
  type MemoryProvenance,
  type TemporalType,
} from './memory-temporal';
import { reportServerError } from './report-error';
import {
  createMemory,
  getMemory,
  listActive,
  syncMentionEdges,
  supersede,
  upsertEntity,
} from './memory-store';

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

/* ── Junk heuristics ────────────────────────────────────────────── */

const GREETING = /^(hi+|hello+|hey+|yo|thanks|thank you|thx|good (morning|afternoon|evening)|gm|gn)\b/i;
const ACKNOWLEDGMENT = /^(ok(ay)?|sure|yes|yeah|yep|no|nope|got it|understood|right|cool|nice|great|awesome|perfect|exactly|absolutely|definitely|indeed|correct)\b/i;
const FILLER = /^(let me (see|check|think|look|find)|hold on|one moment|um+|uh+|ah+|hmm+|well|so|anyway|basically|actually|literally)\b/i;
const META_TALK = /\b(let me (think|check|see|look|find|search|verify|confirm)|I'?ll (now|just|now just|try|check|look|search|find)|now (I'?ll|let me|going to)|first,? (let me|I'?ll)|give me a (moment|second|minute))\b/i;
const TRANSIENT = /\b(right now|at the moment|currently (trying|testing|working on)|just kidding|jk|maybe we'?ll see|not sure yet|thinking out loud|tbd|wip|work in progress|temporary|temp|tmp)\b/i;
const DEBUGGING = /\b(trying|testing|checking|debugging|investigating|looking into|exploring|experimenting|playing with|messing with|figuring out)\b/i;
const ONE_OFF = /\b(run|execute|install|uninstall|delete|remove|kill|stop|start|restart|open|close|show|hide|toggle|switch)\s+(the\s+)?(command|script|server|process|service|file|folder|directory|tab|window|terminal)\b/i;

export function junkReason(raw: string): string | null {
  const s = raw.trim();
  const words = s.split(/\s+/).length;

  if (s.length < 8) return 'too short to be a durable fact';
  if (words < 3) return 'too few words to be a durable fact';
  if (!/[a-z]/i.test(s)) return 'no letters';

  /* Guards against a pasted stack trace or minified blob being stored as
     prose. Measured on letters, so punctuation-heavy code fails it. */
  const letters = s.replace(/[^a-zA-Z]/g, '').length;
  if (letters / s.length < 0.35) return 'mostly non-prose (code/url/noise)';

  if (GREETING.test(s) && words < 7) return 'small talk';
  if (ACKNOWLEDGMENT.test(s) && words < 4) return 'acknowledgment, not a fact';
  if (FILLER.test(s) && words < 8) return 'filler, not a fact';
  if (META_TALK.test(s) && words < 12) return 'meta-talk about what the agent is doing';
  if (TRANSIENT.test(s)) return 'transient state, not a stable fact';
  if (DEBUGGING.test(s) && words < 10) return 'debugging noise, not a fact';
  if (ONE_OFF.test(s) && words < 8) return 'one-off instruction, not a fact';

  if (/^[^a-zA-Z]*\?+\s*$/.test(s)) return 'a question, not a fact';
  /* A short question is noise, but "should we always use X?" states a
     convention — the rule words earn an exemption. */
  if (/\?$/.test(s) && words < 6 && !/\b(rule|convention|always|never|must)\b/i.test(s)) {
    return 'looks like a question';
  }
  if (/^(https?:\/\/|www\.)\S+$/i.test(s)) return 'a bare link';

  return null;
}

/* ── Similarity ─────────────────────────────────────────────────── */

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean));

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared || 1);
}

/** Leading "Backend:" / "Testing —" style label, if any. */
function labelOf(content: string): string | null {
  const m = content.match(/^\s*(?:[*_#-]*\s*)([A-Za-z][A-Za-z /-]{1,24}?)\s*(?:[*_]*\s*)[:：]/);
  return m ? m[1].trim().toLowerCase() : null;
}

/* Entity extraction lives in ./entities.

   It replaced a flat single-token map that could not see any name
   containing a dot: "We use Next.js" tokenized to ["next","js"] and
   matched neither key, so the canonical spelling of most JS frameworks
   extracted nothing at all. The new module resolves aliases to one
   canonical name and matches adjacent token pairs. */

/* ── Fact typing ────────────────────────────────────────────────── */

const DECISION = /\b(decided|chose|picked|going with|settled on|migrated to|switched to|moving to|instead of|after comparing|evaluated)\b/i;
const PATTERN = /\b(always|never|convention|rule:|prefer|typically|usually|standard is|we do|we use|pattern|consistently)\b/i;
const CORRECTION = /\b(actually|no[,.]|that'?s wrong|not quite|not\s+[A-Za-z0-9_.+-]+(?:[,.]|$)|should be|meant to|I meant|correction|fixed|correcting)\b/i;
const PREFERENCE = /\b(prefer|like|love|hate|dislike|favorite|style|taste|personally|I want|I need|I like)\b/i;

export type MemoryType = 'fact' | 'decision' | 'pattern' | 'correction' | 'preference';
const MAX_SUPERSEDE_TARGETS = 25;

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
function detectType(content: string): MemoryType {
  if (CORRECTION.test(content)) return 'correction';
  if (DECISION.test(content)) return 'decision';
  if (PREFERENCE.test(content)) return 'preference';
  if (PATTERN.test(content)) return 'pattern';
  return 'fact';
}

function temporalTypeFor(type: MemoryType): TemporalType {
  if (type === 'decision' || type === 'correction') return 'decision';
  if (type === 'preference' || type === 'pattern') return 'preference';
  return 'state';
}

/* ── Pipeline ───────────────────────────────────────────────────── */

export async function think(userId: string, cand: Candidate): Promise<Decision> {
  const content = cand.content.replace(/\s+/g, ' ').trim();
  const type = detectType(content);

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

  const scope = cand.projectId ?? null;
  const sameScope = (doc: { projectId?: string | null }) =>
    (doc.projectId ?? null) === scope;

  // 1 + 2. Duplicates, before the junk filter (see header note).
  const incoming = tokens(content);
  for (const doc of existing) {
    if (norm(doc.content) === norm(content)) {
      if (cand.supersedesId === doc.$id) {
        return { action: 'reject', reason: 'a memory cannot supersede itself' };
      }
      const intended = new Set(metadataOf(doc).intendedSupersedes ?? []);
      if (cand.supersedesId) intended.add(cand.supersedesId);
      if (intended.size) {
        await finishSupersession(userId, doc.$id, [...intended], cand.projectId);
      }
      await enrichMemoryBestEffort(userId, doc.$id, doc.content);
      return { action: 'duplicate', id: doc.$id };
    }
  }
  for (const doc of existing) {
    if (doc.$id === cand.supersedesId) continue;
    if (jaccard(incoming, tokens(doc.content)) >= 0.55) {
      if (cand.supersedesId) {
        await finishSupersession(userId, doc.$id, [cand.supersedesId], cand.projectId);
      }
      await enrichMemoryBestEffort(userId, doc.$id, doc.content);
      return { action: 'duplicate', id: doc.$id };
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
  const doomed = new Set<string>(explicitTarget ? [explicitTarget.$id] : []);

  /* Supersede only WITHIN the incoming fact's own scope.

     `?? null` because Appwrite returns null for an unset optional
     attribute while an omitted argument is undefined; the two mean the
     same thing here and must compare equal. */
  /* Refinement: the new text restates an old fact and adds to it.
     Containment, not similarity — a longer text that keeps 85% of the old
     one's tokens is a rewrite of it. */
  for (const doc of existing) {
    if (!sameScope(doc)) continue;
    const old = tokens(doc.content);
    if (incoming.size <= old.size) continue;
    let kept = 0;
    for (const t of old) if (incoming.has(t)) kept++;
    if (kept / old.size >= 0.85) doomed.add(doc.$id);
  }

  /* Label collision: two facts both labelled "Backend:" cannot both
     hold. The newer one wins. */
  const label = labelOf(content);
  if (label) {
    for (const doc of existing) {
      if (sameScope(doc) && labelOf(doc.content) === label) doomed.add(doc.$id);
    }
  }

  /* Contradiction: overlapping enough to be about the same subject, not
     so overlapping as to be the same statement. Below 0.5 they are
     unrelated; at 0.9+ the dedup pass above already caught it. */
  if (type === 'correction' || type === 'decision' || type === 'fact') {
    for (const doc of existing) {
      if (!sameScope(doc)) continue;
      const overlap = jaccard(incoming, tokens(doc.content));
      if (overlap >= 0.5 && overlap < 0.9) doomed.add(doc.$id);
    }
  }

  /* A correction such as "Vitest, not Jest" may have low token overlap
     with the old sentence. Only the explicitly negated technology is a
     safe target; matching every entity would also retract an existing
     true "we use Vitest" fact. */
  if (type === 'correction') {
    const negatedEntities = new Set(
      [...content.matchAll(/\bnot\s+([A-Za-z0-9_.+-]+)/gi)].flatMap((match) =>
        extractEntities(match[1]).map((entity) => entity.name),
      ),
    );
    for (const doc of existing) {
      if (!sameScope(doc)) continue;
      const oldEntities = extractEntities(doc.content);
      if (oldEntities.some((entity) => negatedEntities.has(entity.name))) {
        doomed.add(doc.$id);
      }
    }
  }

  if (doomed.size > MAX_SUPERSEDE_TARGETS) {
    return {
      action: 'reject',
      reason: `correction matched more than ${MAX_SUPERSEDE_TARGETS} memories; use supersedesId for a precise correction`,
    };
  }

  // 5. Store.
  const observedAt = cand.observedAt ?? new Date().toISOString();
  const validFrom = cand.validFrom ?? observedAt;
  const created = await createMemory(userId, {
    ...cand,
    content,
    metadata: mergeMemoryMetadata(undefined, {
      memoryType: type,
      confidence: cand.confidence ?? (cand.provenance?.type === 'user' ? 1 : 0.8),
      provenance: cand.provenance ?? { type: 'agent' },
      intendedSupersedes: [...doomed],
      observedAt,
      validFrom,
      ...(cand.validTo ? { validTo: cand.validTo } : {}),
      temporalType: cand.temporalType ?? temporalTypeFor(type),
    }),
    supersedeIds: [...doomed],
  });

  /* Enrichment remains best-effort: a graph failure must not roll back a
     fact that has already been accepted and stored. */
  await enrichMemoryBestEffort(userId, created.$id, content);

  const reason = doomed.size
    ? type === 'correction'
      ? 'correction supersedes the original'
      : label
        ? `replaced older "${label}" facts`
        : 'richer rewrite of an existing fact'
    : `new ${type}`;

  if (doomed.size) {
    await finishSupersession(userId, created.$id, [...doomed], cand.projectId);
  }

  return { action: 'add', id: created.$id, invalidated: [...doomed], reason };
}
