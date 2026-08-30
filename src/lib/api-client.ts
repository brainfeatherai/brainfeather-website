import { useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function bfFetch<T>(
  credential: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${credential}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Could not reach the Brainfeather API.");
  }

  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

export type Fact = {
  $id: string;
  $createdAt: string;
  source: string;
  title?: string;
  content: string;
  category: string;
  status: "active" | "invalid";
  projectId?: string;
  branch?: string;
  taskId?: string;
  temporal?: {
    observedAt: string;
    validFrom: string;
    validTo?: string;
    invalidatedAt?: string;
    temporalType: "state" | "event" | "plan" | "preference" | "decision" | "absence";
    confidence: number;
    provenance: { type: string; reference?: string };
  };
};

export type EntityRow = {
  $id: string;
  name: string;
  type: string;
  summary?: string;
};

export type EdgeRow = {
  $id: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight: number;
  validTo?: string;
};

export type ApiKeyRow = {
  $id: string;
  $createdAt: string;
  name: string;
  keyHint: string;
  lastUsedAt?: string;
};

export type RequestAnalyticsRow = {
  $id: string;
  $createdAt: string;
  operation: string;
  method: string;
  status: number;
  durationMs: number;
  occurredAt: string;
  keyName: string;
};

export type RequestAnalytics = {
  configured: boolean;
  windowDays: number;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  successRate: number;
  averageDurationMs: number;
  p95DurationMs: number;
  capped: boolean;
  byOperation: { operation: string; count: number; averageDurationMs: number }[];
  recent: RequestAnalyticsRow[];
};

export type OverviewData = {
  memories: number;
  entities: number;
  edges: number;
  keys: number;
  pendingCandidates: number;
  analytics: RequestAnalytics;
  path?: {
    recallMs?: number;
    mcpMs?: number;
    captureMs?: number;
  };
};

export type SaveDecision = {
  action: "add" | "duplicate" | "reject";
  id?: string;
  reason?: string;
  invalidated?: string[];
};

export type MemoryCandidate = {
  $id: string;
  $createdAt: string;
  source: string;
  title?: string;
  content: string;
  category: string;
  projectId?: string;
  branch?: string;
  taskId?: string;
  confidence: number;
  status: "pending" | "approved" | "rejected";
};

export type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export function decisionLine(d: SaveDecision): string {
  if (d.action === "reject") return `Not stored — ${d.reason ?? "filtered"}`;
  if (d.action === "duplicate") return "Already known. Nothing changed.";
  const retracted = d.invalidated?.length
    ? ` Retracted ${d.invalidated.length} superseded fact${
        d.invalidated.length > 1 ? "s" : ""
      }.`
    : "";
  return `Saved — ${d.reason ?? "new fact"}.${retracted}`;
}

export function useApiSession() {
  const { jwt, jwtError, refreshJwt } = useAuth();
  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      let credential = jwt ?? (await refreshJwt());
      if (!credential) throw new ApiError(401, "Dashboard authentication is unavailable.");

      try {
        return await bfFetch<T>(credential, path, init);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const refreshed = await refreshJwt();
        if (!refreshed) throw error;
        credential = refreshed;
        return bfFetch<T>(credential, path, init);
      }
    },
    [jwt, refreshJwt],
  );

  return { token: jwt, error: jwt ? null : jwtError, request };
}
