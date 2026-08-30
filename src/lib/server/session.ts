import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type AgentSession = {
  id: string;
  userId: string;
  projectId?: string;
  branch?: string;
  taskId?: string;
  startedAt: string;
  recalledAt?: string;
  captureCount: number;
  lastActivityAt: string;
};

function sessionSecret(): string {
  return (
    process.env.BRAINFEATHER_SESSION_SECRET ||
    process.env.BRAINFEATHER_DATA_INDEX_KEY ||
    ''
  );
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function startSession(
  userId: string,
  scope: { projectId?: string; branch?: string; taskId?: string } = {},
  now = new Date(),
): AgentSession {
  const startedAt = now.toISOString();
  return {
    id: randomUUID(),
    userId,
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
    ...(scope.branch ? { branch: scope.branch } : {}),
    ...(scope.taskId ? { taskId: scope.taskId } : {}),
    startedAt,
    captureCount: 0,
    lastActivityAt: startedAt,
  };
}

export function needsProactiveRecall(session: AgentSession): boolean {
  return session.recalledAt === undefined;
}

export function markRecalled(session: AgentSession, now = new Date()): AgentSession {
  const at = now.toISOString();
  return { ...session, recalledAt: at, lastActivityAt: at };
}

export function recordCapture(session: AgentSession, count: number, now = new Date()): AgentSession {
  const at = now.toISOString();
  return {
    ...session,
    captureCount: session.captureCount + Math.max(0, count),
    lastActivityAt: at,
  };
}

export function encodeSession(session: AgentSession, secret = sessionSecret()): string {
  if (!secret) throw new Error('Session signing key is not configured.');
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function tryEncodeSession(
  session: AgentSession,
  secret = sessionSecret(),
): string | undefined {
  try {
    return encodeSession(session, secret);
  } catch {
    return undefined;
  }
}

export function decodeSession(
  token: string,
  userId: string,
  secret = sessionSecret(),
): AgentSession | null {
  if (!secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AgentSession;
    if (
      typeof session?.id !== 'string' ||
      session.userId !== userId ||
      typeof session.startedAt !== 'string' ||
      typeof session.captureCount !== 'number' ||
      (session.projectId !== undefined && typeof session.projectId !== 'string') ||
      (session.branch !== undefined && typeof session.branch !== 'string') ||
      (session.taskId !== undefined && typeof session.taskId !== 'string') ||
      !Number.isFinite(Date.parse(session.startedAt)) ||
      Date.now() - Date.parse(session.startedAt) > SESSION_TTL_MS
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}
