import 'server-only';

import { secretReason } from './validate.ts';
import {
  type Candidate,
  type Decision,
} from './think.ts';
import { detectMemoryType, junkReason, type StoredFact } from './memory-policy.ts';
import { extractEntities } from './entities.ts';
import { listActive } from './memory-store.ts';
import { queueMemoryCandidate } from './candidate-store.ts';
import { recordCapture, type AgentSession } from './session.ts';

export type CaptureCandidate = {
  content: string;
  category: Candidate['category'];
  /** 0..1, how strongly the sentence reads as a durable, self-contained fact. */
  confidence: number;
};

export type CaptureResult = {
  candidates: number;
  queued: number;
  saved: number;
  duplicates: number;
  rejected: number;
  decisions: Decision[];
  session?: AgentSession;
};

const CATEGORIES = new Set<Candidate['category']>([
  'preference',
  'context',
  'decision',
  'code',
  'project',
  'team',
]);

const DURABLE_SIGNAL =
  /\b(?:decided|chose|picked|switched|migrated|moved to|adopted|standardi[sz]ed on|replaced|uses?|using|built with|configured|requires?|required|must|prefers?|always|never|convention|standard|architecture|repository|codebase|project|monorepo|backend|frontend|database|auth(?:entication)?|deploys?|runs on)\b|\bI (?:don't|do not) (?:want|like)\b|\bI (?:want|hate|dislike)\b/i;

/* Capture quality rules. Stop-hook transcripts are mostly the agent
   narrating its own work, so the extractor has to separate three things
   that all contain "durable" words:

   1. Stand-alone facts vs. fragments. A memory is read months later with
      no surrounding conversation, so it must be decontextualized, the
      requirement Choi et al. formalize in "Decontextualization: Making
      Sentences Stand-Alone" (TACL 2021). "It uses Redis" names nothing.
      Without a model to rewrite it, the safe move is to not capture it.
   2. Settled facts vs. speculation. Hedged or questioning sentences
      ("maybe we should", "I think", "should I…?") are not decisions.
   3. Knowledge vs. narration. "I added a test" is an event in this
      session, not knowledge about the project. LongMemEval (ICLR 2025)
      finds recall improves when stored values are fine-grained facts
      rather than raw session text; narration is the raw text. */
const ANAPHORIC_START =
  /^(?:it|its|it's|that|that's|these|those|they|they're|them|he|she|here|there)\b|^this\b(?!\s+(?:project|repo|repository|codebase|monorepo|app|application|service|team|package|library|workspace)\b)/i;
const HEDGE =
  /\b(?:maybe|might|perhaps|probably|possibly|presumably|could|I think|I guess|I believe|I suspect|not sure|unsure|I don't know|I do not know|seems?(?: to| like)?|appears? to|looks like|sounds like|should (?:we|I)|would it|later|for now|eventually)\b/i;
/* The reason clause of a rule may hedge without weakening the rule:
   "Never deploy on Fridays because rollbacks might be slow." */
const REASON_CLAUSE = /\s*(?:,\s*)?\b(?:because|since|as|so that)\b.*$/i;
const NARRATION =
  /^(?:now,?\s+|next,?\s+|then,?\s+|ok(?:ay)?,?\s+)?(?:I|we)(?:'ve|'m|'ll|\s+have|\s+am|\s+will|\s+just)?\s+(?:just\s+|now\s+|also\s+)?(?:updated|added|ran|run|running|created|fixed|changed|removed|deleted|installed|wrote|written|implemented|refactored|modified|tested|checked|verified|pushed|committed|made|renamed|adding|updating|fixing|going to|about to|looked|looking|read|reading|opened|found|noticed|tried|trying)\b/i;
/* Plans are not facts until they happen. */
const FUTURE_INTENT =
  /^(?:now|next|then|first|after that)?,?\s*(?:I|we)(?:'ll|\s+will|\s+am going to|'m going to|\s+are going to|'re going to|\s+plan to|\s+intend to)\b/i;
/* Sentences addressed to the user, or pointing at other parts of the chat,
   only make sense inside this conversation. */
const CONVERSATIONAL =
  /\b(?:let me know|if you (?:want|like|need|prefer)|want me to|would you like|do you want)\b/i;
const CHAT_REFERENCE = /\b(?:above|below|earlier|previously|just now)\s*[.!]?\s*$|\b(?:which|that) I\b/i;
/* "Perfect, the frontend is working now." reports status, not knowledge. */
const INTERJECTION_START =
  /^(?:perfect|great|done|nice|awesome|ok(?:ay)?|cool|sure|yes|yep|good|excellent|alright|all right)\b\s*[,!.:—-]/i;

const DECISION_MARKER = /\b(?:decided|chose|settled on|going with|switched|migrated|instead of|over)\b/i;
const RULE_MARKER = /\b(?:always|never|must|do not|don't|convention|standard|required|requires?)\b/i;
const PREFERENCE_MARKER = /\bI (?:prefer|want|don't want|do not want|like|hate|dislike)\b/i;
const MAX_CANDIDATES_PER_CAPTURE = 8;

export function categoryForType(
  type: ReturnType<typeof detectMemoryType>,
  content: string,
): CaptureCandidate['category'] {
  if (type === 'preference') return 'preference';
  if (type === 'decision' || type === 'correction') return 'decision';
  if (type === 'pattern') return 'code';
  if (/\b(this (?:project|repo|codebase)|repository|monorepo)\b/i.test(content)) {
    return 'project';
  }
  return 'context';
}

/** Why a sentence is not a durable, stand-alone memory, or null if it is. */
export function captureRejectReason(sentence: string): string | null {
  if (/\?\s*$/.test(sentence)) return 'a question, not a settled fact';
  if (INTERJECTION_START.test(sentence)) return 'a status report, not a durable fact';
  if (ANAPHORIC_START.test(sentence)) return 'depends on earlier context (unresolved reference)';
  if (CONVERSATIONAL.test(sentence) || CHAT_REFERENCE.test(sentence)) {
    return 'only makes sense inside this conversation';
  }
  if (HEDGE.test(sentence.replace(REASON_CLAUSE, ''))) return 'speculative, not settled';
  if (FUTURE_INTENT.test(sentence)) return 'a plan, not a settled fact';
  if (NARRATION.test(sentence)) return 'narrates this session, not a durable fact';
  return null;
}

const normalizedTokens = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );

/* Only skip a capture that says nothing the stored memory does not already
   say. A near-match with new content ("deployed on Fly.io" vs. "deployed on
   Vercel") is a correction: it must reach review, where approval runs the
   supersession check, instead of being dropped as a duplicate. This mirrors
   the split in Mem0's update phase between NOOP and UPDATE/DELETE. */
export function alreadyKnown(content: string, known: readonly StoredFact[]): boolean {
  const incoming = normalizedTokens(content);
  if (!incoming.size) return false;
  return known.some((fact) => {
    const stored = normalizedTokens(fact.content);
    for (const token of incoming) if (!stored.has(token)) return false;
    return true;
  });
}

/* Confidence starts below the old fixed 0.7 and only rises with evidence,
   so review can put the strongest candidates first instead of presenting
   every sentence as equally likely. */
export function captureConfidence(sentence: string): number {
  let score = 0.5;
  if (DECISION_MARKER.test(sentence)) score += 0.15;
  if (RULE_MARKER.test(sentence)) score += 0.15;
  if (PREFERENCE_MARKER.test(sentence)) score += 0.15;
  if (/`[^`]+`/.test(sentence)) score += 0.05;
  if (extractEntities(sentence).length) score += 0.1;
  const words = sentence.split(/\s+/).length;
  if (words < 5 || words > 40) score -= 0.1;
  return Math.round(Math.max(0.3, Math.min(0.95, score)) * 100) / 100;
}

function splitActivity(activity: string): string[] {
  return activity
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=\.)\s+(?=[A-Z])/))
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function extractActivityFacts(activity: string): CaptureCandidate[] {
  const seen = new Set<string>();
  const facts: CaptureCandidate[] = [];

  for (const part of splitActivity(activity)) {
    if (secretReason(part) || junkReason(part) || !DURABLE_SIGNAL.test(part)) continue;
    if (captureRejectReason(part)) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({
      content: part,
      category: categoryForType(detectMemoryType(part), part),
      confidence: captureConfidence(part),
    });
  }

  /* One long transcript must not flood the review queue. Keep the
     strongest candidates, in their original order. */
  if (facts.length <= MAX_CANDIDATES_PER_CAPTURE) return facts;
  const kept = new Set(
    [...facts]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_CANDIDATES_PER_CAPTURE),
  );
  return facts.filter((fact) => kept.has(fact));
}

export async function captureFromActivity(
  userId: string,
  input: {
    activity: string;
    projectId?: string;
    branch?: string;
    taskId?: string;
    source?: Candidate['source'];
    session?: AgentSession;
  },
): Promise<CaptureResult> {
  const facts = extractActivityFacts(input.activity);
  const decisions: Decision[] = [];
  let queued = 0;
  let duplicates = 0;

  /* Compare against what the user already has before queueing, the same
     "is this new?" step Mem0's update phase runs against similar stored
     memories. A fact already remembered should never reach review.
     Best effort: if the lookup fails, capture still queues. */
  let known: StoredFact[] = [];
  if (facts.length) {
    try {
      known = await listActive(userId, {
        projectId: input.projectId ?? input.session?.projectId,
        limit: 100,
      });
    } catch {
      known = [];
    }
  }

  for (const fact of facts) {
    if (!CATEGORIES.has(fact.category)) continue;
    if (alreadyKnown(fact.content, known)) {
      duplicates++;
      continue;
    }
    const result = await queueMemoryCandidate(
      userId,
      {
        content: fact.content,
        category: fact.category,
        source: input.source,
        projectId: input.projectId ?? input.session?.projectId,
        branch: input.branch ?? input.session?.branch,
        taskId: input.taskId ?? input.session?.taskId,
        provenance: {
          type: 'agent',
          ...(input.session ? { reference: input.session.id } : {}),
        },
        confidence: fact.confidence,
      },
      input.session?.id,
    );
    if (result.created) queued++;
    else duplicates++;
  }

  return {
    candidates: facts.length,
    queued,
    saved: 0,
    duplicates,
    rejected: 0,
    decisions,
    ...(input.session
      ? { session: recordCapture(input.session, facts.length) }
      : {}),
  };
}
