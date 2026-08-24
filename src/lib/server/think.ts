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
  createMemory,
  createEdge,
  listActive,
  listEntities,
  supersede,
  upsertEntity,
} from './memory-store';

export type Candidate = {
  content: string;
  category: string;
  source?: string;
  title?: string;
  projectId?: string;
};

export type Decision =
  | { action: 'reject'; reason: string }
  | { action: 'duplicate'; id: string }
  | { action: 'add'; id: string; invalidated: string[]; reason: string };

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
const CORRECTION = /\b(actually|no[,.]|that'?s wrong|not quite|should be|meant to|I meant|correction|fixed|correcting)\b/i;
const PREFERENCE = /\b(prefer|like|love|hate|dislike|favorite|style|taste|personally|I want|I need|I like)\b/i;

export type MemoryType = 'fact' | 'decision' | 'pattern' | 'correction' | 'preference';

/* Order matters: a correction that also states a decision is a
   correction, because it has to be able to supersede the decision. */
function detectType(content: string): MemoryType {
  if (CORRECTION.test(content)) return 'correction';
  if (DECISION.test(content)) return 'decision';
  if (PREFERENCE.test(content)) return 'preference';
  if (PATTERN.test(content)) return 'pattern';
  return 'fact';
}

/* ── Pipeline ───────────────────────────────────────────────────── */

export async function think(userId: string, cand: Candidate): Promise<Decision> {
  const content = cand.content.replace(/\s+/g, ' ').trim();
  const type = detectType(content);

  /* Compared against THIS project's facts (plus global ones), not every
     fact the user owns. Without the scope, saving "we use Postgres" in a
     second project was rejected as a duplicate of the first project's
     fact — refusing a genuinely project-specific decision. Dedup and
     contradiction detection both read from here, so both were affected. */
  const existing = await listActive(userId, {
    projectId: cand.projectId,
    limit: 100,
  });

  // 1 + 2. Duplicates, before the junk filter (see header note).
  const incoming = tokens(content);
  for (const doc of existing) {
    if (norm(doc.content) === norm(content)) return { action: 'duplicate', id: doc.$id };
  }
  for (const doc of existing) {
    if (jaccard(incoming, tokens(doc.content)) >= 0.55) {
      return { action: 'duplicate', id: doc.$id };
    }
  }

  // 3. Junk.
  const junk = junkReason(content);
  if (junk) return { action: 'reject', reason: junk };

  // 4. What does this replace?
  const doomed = new Set<string>();

  /* Supersede only WITHIN the incoming fact's own scope.

     `existing` deliberately includes global (unscoped) facts so they
     participate in dedup and contradiction checks — a global convention
     should stop a project from re-recording it. But retraction is a
     different power: without this filter, saving a refinement inside
     project A could retract a GLOBAL preference and replace it with an
     A-scoped fact, making it disappear from every other project. Silent,
     and indistinguishable from data loss.

     The same guard protects the reverse case: a write with no scope sees
     every project's facts, and must not retract one belonging to a
     project it was not made in.

     `?? null` because Appwrite returns null for an unset optional
     attribute while an omitted argument is undefined; the two mean the
     same thing here and must compare equal. */
  const scope = cand.projectId ?? null;
  const sameScope = (doc: { projectId?: string | null }) =>
    (doc.projectId ?? null) === scope;

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

  // 5. Store.
  const created = await createMemory(userId, {
    ...cand,
    content,
    metadata: JSON.stringify({ memoryType: type, confidence: 0.8 }),
  });

  /* Entities and edges are best-effort: a failure here loses a graph
     link, and must not lose the fact that was already written. */
  try {
    const names = extractEntities(content);
    for (const e of names) await upsertEntity(userId, e.name, e.type);

    if (names.length) {
      const all = await listEntities(userId);
      for (const e of names) {
        const match = all.find((x) => x.name.toLowerCase() === e.name.toLowerCase());
        if (match) await createEdge(userId, created.$id, match.$id, 'mentioned_in', 0.7);
      }
    }
  } catch {
    // Fact is stored; graph enrichment is not worth failing the request.
  }

  const reason = doomed.size
    ? type === 'correction'
      ? 'correction supersedes the original'
      : label
        ? `replaced older "${label}" facts`
        : 'richer rewrite of an existing fact'
    : `new ${type}`;

  if (doomed.size) await supersede([...doomed], created.$id);

  return { action: 'add', id: created.$id, invalidated: [...doomed], reason };
}
