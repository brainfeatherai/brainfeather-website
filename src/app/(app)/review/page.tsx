"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { RequireAuth } from "@/components/AuthProvider";
import {
  decisionLine,
  useApiSession,
  type MemoryCandidate,
  type SaveDecision,
} from "@/lib/api-client";

const ICON_BTN =
  "hairline rounded-md border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-50";

type ReviewStatus = "pending" | "approved" | "rejected";

function CandidateRow({
  candidate,
  onApprove,
  onReject,
  busy,
}: {
  candidate: MemoryCandidate;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  busy: boolean;
}) {
  const when = new Date(candidate.$createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <li className="hairline group rounded-xl border bg-paper p-4 transition-[border-color] duration-300 hover:border-emerald/35">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-forest/65">
          {candidate.category}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-forest/40">
          {candidate.source}
        </span>
        {candidate.projectId ? (
          <span
            title={candidate.projectId}
            className="max-w-[16ch] truncate rounded-md bg-paper-dim px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-forest/45"
          >
            {candidate.projectId}
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-forest/35">
          {when}
        </span>
      </div>

      {candidate.title ? (
        <h3 className="mt-2 text-[14px] font-semibold text-forest">{candidate.title}</h3>
      ) : null}

      <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-forest/85">
        {candidate.content}
      </p>

      {candidate.status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onApprove(candidate.$id)}
            disabled={busy}
            className={`${ICON_BTN} text-emerald/80 hover:border-emerald/40 hover:text-emerald`}
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onReject(candidate.$id)}
            disabled={busy}
            className={`${ICON_BTN} text-forest/45 hover:border-red-400/50 hover:text-red-300`}
          >
            Reject
          </button>
        </div>
      ) : (
        <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.1em] text-forest/35">
          {candidate.status}
        </p>
      )}
    </li>
  );
}

function ReviewView() {
  const { token, error: sessionError, request } = useApiSession();
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [candidates, setCandidates] = useState<MemoryCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchCandidates = useCallback(
    () =>
      request<{ candidates: MemoryCandidate[] }>(
        `/memory-candidates?status=${status}&limit=100`,
      ),
    [request, status],
  );

  const load = useCallback(async () => {
    const result = await fetchCandidates();
    setCandidates(result.candidates);
  }, [fetchCandidates]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchCandidates()
      .then((result) => {
        if (!active) return;
        setError(null);
        setCandidates(result.candidates);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load review queue.");
        setCandidates([]);
      });
    return () => {
      active = false;
    };
  }, [token, fetchCandidates]);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const result = await request<{ decision: SaveDecision }>(
        `/memory-candidates/${encodeURIComponent(id)}/approve`,
        { method: "POST" },
      );
      setNotice(decisionLine(result.decision));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await request(`/memory-candidates/${encodeURIComponent(id)}/reject`, {
        method: "POST",
      });
      setNotice("Rejected. This candidate will not enter recall.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reject.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell
      title="Review queue"
      intro="Approve captured agent facts before they enter recall. Rejected items never become memories."
    >
      {error ?? sessionError ? (
        <p className="mb-6 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-[13px] text-red-200">
          {error ?? sessionError}
        </p>
      ) : null}

      {notice ? (
        <p
          aria-live="polite"
          className="hairline mb-6 rounded-xl border bg-white/[0.035] p-4 text-[13px] text-forest/70"
        >
          {notice}
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {(["pending", "approved", "rejected"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setStatus(value);
              setCandidates(null);
              setError(null);
              setNotice(null);
            }}
            className={`hairline rounded-md border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] ${
              status === value
                ? "border-emerald/40 bg-white/[0.06] text-forest"
                : "text-forest/45 hover:text-forest"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {candidates === null ? (
        <output className="font-mono text-[10px] uppercase tracking-[0.1em] text-forest/40">
          Loading candidates…
        </output>
      ) : candidates.length === 0 ? (
        error || sessionError ? null : (
          <p className="rounded-xl border border-dashed border-white/[0.10] bg-paper-dim p-6 text-[13px] text-forest/45">
            {status === "pending" ? (
              <>
                No captured facts waiting for review. Connect a client with{" "}
                <Link href="/api-keys" className="underline decoration-emerald/40 underline-offset-2">
                  an API key
                </Link>{" "}
                and run <code className="font-mono text-[12px]">npx -y @brainfeather/mcp@1.5.0 init</code>
                . Inferred facts appear here instead of entering recall.
              </>
            ) : (
              `No ${status} candidates.`
            )}
          </p>
        )
      ) : (
        <ul className="grid gap-3">
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.$id}
              candidate={candidate}
              onApprove={approve}
              onReject={reject}
              busy={busyId === candidate.$id}
            />
          ))}
        </ul>
      )}
    </AppShell>
  );
}

export default function ReviewPage() {
  return (
    <RequireAuth>
      <ReviewView />
    </RequireAuth>
  );
}
