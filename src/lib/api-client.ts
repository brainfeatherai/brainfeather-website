/* ────────────────────────────────────────────────────────────────
   Browser-side client for /api/v1/*, authenticated with the user's
   own bf_live_ key.

   Why the dashboard talks to the API instead of Appwrite directly:
   the key resolves to a userId server-side, and every route enforces
   ownership against the admin client — so the site needs NO read or
   write permissions on the data collections for signed-in users. One
   credential (the bf key) gates everything, which is the product
   promise.

   The key is obtainable in-browser because api_keys rows are readable
   by their owner's session (Settings already relies on that). Using
   it here adds no new exposure; it removes the need for per-collection
   session grants.
   ──────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiKeyService } from "@/services/appwrite";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function bfFetch<T>(
  key: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Could not reach the Brainfeather API. Is the site's server running?",
    );
  }

  if (res.status === 401) {
    throw new ApiError(
      401,
      "Key rejected — it may have been revoked. Reload the page to get a fresh one.",
    );
  }

  const body = (await res.json().catch(() => null)) as
    | { error?: string }
    | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error ?? `Request failed (${res.status}).`,
    );
  }
  return body as T;
}

/* ── Response shapes (mirror lib/server/memory-store.ts) ────────── */

export type Fact = {
  $id: string;
  $createdAt: string;
  source: string;
  title?: string;
  content: string;
  category: string;
  status: "active" | "invalid";
  projectId?: string;
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

export type SaveDecision = {
  action: "add" | "duplicate" | "reject";
  id?: string;
  reason?: string;
  invalidated?: string[];
};

/* Human line for a save outcome. The API answers add | duplicate |
   reject with a reason, and none of the three is a failure — the
   wording mirrors the MCP server's decisionLine(). */
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

/* Resolves the bf key the dashboard runs on: the newest existing key,
   or a fresh one named "Dashboard" when the account has none. Resolved
   once per mount; a revoked key surfaces as a 401 with a reload hint. */
export function useBfKey(): { key: string | null; error: string | null } {
  const { user } = useAuth();
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    (async () => {
      try {
        const res = await apiKeyService.list(user.$id);
        const docs = res.documents as unknown as { key: string }[];
        if (!active) return;
        if (docs.length > 0) {
          setKey(docs[0].key);
          return;
        }
        const created = (await apiKeyService.create(
          user.$id,
          "Dashboard",
        )) as unknown as { key: string };
        if (!active) return;
        setKey(created.key);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Could not get an API key.",
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [user]);

  return { key, error };
}
