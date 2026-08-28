import 'server-only';

import { secretReason } from './validate.ts';
import {
  detectMemoryType,
  junkReason,
  think,
  type Candidate,
  type Decision,
} from './think.ts';
import { recordCapture, type AgentSession } from './session.ts';

export type CaptureCandidate = {
  content: string;
  category: Candidate['category'];
};

export type CaptureResult = {
  candidates: number;
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
    if (secretReason(part) || junkReason(part)) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({
      content: part,
      category: categoryForType(detectMemoryType(part), part),
    });
  }

  return facts;
}

export async function captureFromActivity(
  userId: string,
  input: {
    activity: string;
    projectId?: string;
    source?: Candidate['source'];
    session?: AgentSession;
  },
): Promise<CaptureResult> {
  const facts = extractActivityFacts(input.activity);
  const decisions: Decision[] = [];

  for (const fact of facts) {
    if (!CATEGORIES.has(fact.category)) continue;
    decisions.push(
      await think(userId, {
        content: fact.content,
        category: fact.category,
        source: input.source,
        projectId: input.projectId ?? input.session?.projectId,
        provenance: {
          type: 'agent',
          ...(input.session ? { reference: input.session.id } : {}),
        },
        confidence: 0.7,
      }),
    );
  }

  const saved = decisions.filter((decision) => decision.action === 'add').length;
  const duplicates = decisions.filter((decision) => decision.action === 'duplicate').length;
  const rejected = decisions.filter((decision) => decision.action === 'reject').length;

  return {
    candidates: facts.length,
    saved,
    duplicates,
    rejected,
    decisions,
    ...(input.session
      ? { session: recordCapture(input.session, facts.length) }
      : {}),
  };
}
