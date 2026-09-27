import { extractEntities } from './entities.ts';

const GREETING = /^(hi+|hello+|hey+|yo|thanks|thank you|thx|good (morning|afternoon|evening)|gm|gn)\b/i;
const ACKNOWLEDGMENT = /^(ok(ay)?|sure|yes|yeah|yep|no|nope|got it|understood|right|cool|nice|great|awesome|perfect|exactly|absolutely|definitely|indeed|correct)\b/i;
const FILLER = /^(let me (see|check|think|look|find)|hold on|one moment|um+|uh+|ah+|hmm+|well|so|anyway|basically|actually|literally)\b/i;
const META_TALK = /\b(let me (think|check|see|look|find|search|verify|confirm)|I'?ll (now|just|now just|try|check|look|search|find)|now (I'?ll|let me|going to)|first,? (let me|I'?ll)|give me a (moment|second|minute))\b/i;
const TRANSIENT = /\b(right now|at the moment|currently (trying|testing|working on)|just kidding|jk|maybe we'?ll see|not sure yet|thinking out loud|tbd|wip|work in progress|temporary|temp|tmp)\b/i;
const DEBUGGING = /\b(trying|testing|checking|debugging|investigating|looking into|exploring|experimenting|playing with|messing with|figuring out)\b/i;
const ONE_OFF = /\b(run|execute|install|uninstall|delete|remove|kill|stop|start|restart|open|close|show|hide|toggle|switch)\s+(the\s+)?(command|script|server|process|service|file|folder|directory|tab|window|terminal)\b/i;

const DECISION = /\b(decided|chose|picked|going with|settled on|migrated to|switched to|moving to|instead of|after comparing|evaluated)\b/i;
const PATTERN = /\b(always|never|convention|rule:|prefer|typically|usually|standard is|we do|we use|pattern|consistently)\b/i;
const CORRECTION = /\b(actually|no[,.]|that'?s wrong|not quite|not\s+[A-Za-z0-9_.+-]+(?:[,.]|$)|should be|meant to|I meant|correction|fixed|correcting)\b/i;
const PREFERENCE = /\b(prefer|like|love|hate|dislike|favorite|style|taste|personally|I want|I need|I like)\b/i;
const MAX_SUPERSEDE_TARGETS = 25;

export type MemoryType = 'fact' | 'decision' | 'pattern' | 'correction' | 'preference';

export type StoredFact = {
  $id: string;
  content: string;
  projectId?: string | null;
  metadata?: string;
  branch?: string;
  taskId?: string;
};

export function junkReason(raw: string): string | null {
  const s = raw.trim();
  const words = s.split(/\s+/).length;

  if (s.length < 8) return 'too short to be a durable fact';
  if (words < 3) return 'too few words to be a durable fact';
  if (!/[a-z]/i.test(s)) return 'no letters';

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
  if (/\?$/.test(s) && words < 6 && !/\b(rule|convention|always|never|must)\b/i.test(s)) {
    return 'looks like a question';
  }
  if (/^(https?:\/\/|www\.)\S+$/i.test(s)) return 'a bare link';
  return null;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean));

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared || 1);
}

function labelOf(content: string): string | null {
  const match = content.match(/^\s*(?:[*_#-]*\s*)([A-Za-z][A-Za-z /-]{1,24}?)\s*(?:[*_]*\s*)[:：]/);
  return match ? match[1].trim().toLowerCase() : null;
}

export function jaccardSimilarity(a: string, b: string): number {
  return jaccard(tokens(a), tokens(b));
}

export function detectMemoryType(content: string): MemoryType {
  if (CORRECTION.test(content)) return 'correction';
  if (DECISION.test(content)) return 'decision';
  if (PREFERENCE.test(content)) return 'preference';
  if (PATTERN.test(content)) return 'pattern';
  return 'fact';
}

export function findDuplicate(
  content: string,
  existing: readonly StoredFact[],
  skipId?: string,
): StoredFact | undefined {
  const incoming = tokens(content);
  for (const fact of existing) {
    if (norm(fact.content) === norm(content)) return fact;
  }
  for (const fact of existing) {
    if (fact.$id === skipId) continue;
    if (jaccard(incoming, tokens(fact.content)) >= 0.55) return fact;
  }
  return undefined;
}

export function planSupersedes(
  content: string,
  existing: readonly StoredFact[],
  opts: {
    projectId?: string;
    branch?: string;
    taskId?: string;
    explicitTargetId?: string;
    currentlyValid: boolean;
  },
): { doomed: string[]; type: MemoryType; reason: string } | { reject: string } {
  const type = detectMemoryType(content);
  const incoming = tokens(content);
  const sameScope = (fact: StoredFact) =>
    (fact.projectId ?? null) === (opts.projectId ?? null) &&
    fact.branch === opts.branch &&
    fact.taskId === opts.taskId;
  const doomed = new Set<string>(
    opts.currentlyValid && opts.explicitTargetId ? [opts.explicitTargetId] : [],
  );

  for (const fact of existing) {
    if (!opts.currentlyValid) break;
    if (!sameScope(fact)) continue;
    const old = tokens(fact.content);
    if (incoming.size <= old.size) continue;
    let kept = 0;
    for (const token of old) if (incoming.has(token)) kept++;
    if (kept / old.size >= 0.85) doomed.add(fact.$id);
  }

  const label = labelOf(content);
  if (opts.currentlyValid && label) {
    for (const fact of existing) {
      if (sameScope(fact) && labelOf(fact.content) === label) doomed.add(fact.$id);
    }
  }

  if (opts.currentlyValid && (type === 'correction' || type === 'decision' || type === 'fact')) {
    for (const fact of existing) {
      if (!sameScope(fact)) continue;
      const overlap = jaccard(incoming, tokens(fact.content));
      if (overlap >= 0.5 && overlap < 0.9) doomed.add(fact.$id);
    }
  }

  if (opts.currentlyValid && type === 'correction') {
    const negatedEntities = new Set(
      [...content.matchAll(/\bnot\s+([A-Za-z0-9_.+-]+)/gi)].flatMap((match) =>
        extractEntities(match[1]).map((entity) => entity.name),
      ),
    );
    for (const fact of existing) {
      if (!sameScope(fact)) continue;
      const oldEntities = extractEntities(fact.content);
      if (oldEntities.some((entity) => negatedEntities.has(entity.name))) doomed.add(fact.$id);
    }
  }

  if (doomed.size > MAX_SUPERSEDE_TARGETS) {
    return {
      reject: `correction matched more than ${MAX_SUPERSEDE_TARGETS} memories; use supersedesId for a precise correction`,
    };
  }

  const reason = doomed.size
    ? type === 'correction'
      ? 'correction supersedes the original'
      : label
        ? `replaced older "${label}" facts`
        : 'richer rewrite of an existing fact'
    : `new ${type}`;

  return { doomed: [...doomed], type, reason };
}
