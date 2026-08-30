"use client";

/* ────────────────────────────────────────────────────────────────
   /dashboard — manage the facts currently held about you.

   Every operation runs through /api/v1 with a short-lived Appwrite JWT.
   That means adds go through the
   SAME think() pipeline the MCP server uses — dedup, junk filter,
   supersede, entity linking — so a fact saved here is indistinguishable
   from one an agent saved, and the reply says which of the three
   outcomes happened.
   ──────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { RequireAuth } from "@/components/AuthProvider";
import {
  decisionLine,
  useApiSession,
  type Fact,
  type SaveDecision,
} from "@/lib/api-client";

const CATEGORIES = [
  "preference",
  "context",
  "decision",
  "code",
  "project",
  "team",
] as const;

const FIELD =
  "hairline h-11 w-full rounded-lg border bg-paper px-4 text-[14px] text-forest placeholder:text-forest/35 focus:border-emerald/50 focus:outline-none focus:ring-2 focus:ring-emerald/20";

const ICON_BTN =
  "hairline rounded-md border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-50";

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="hairline rounded-xl border bg-paper p-4">
      <div className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-forest">
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
        {label}
      </div>
    </div>
  );
}

function MemoryRow({
  memory,
  onRetract,
  onDelete,
  onEdit,
  busy,
}: {
  memory: Fact;
  onRetract: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (memory: Fact) => void;
  busy: boolean;
}) {
  const when = new Date(memory.$createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <li className="hairline group rounded-xl border bg-paper p-4 transition-[border-color] duration-300 hover:border-emerald/35">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-forest/65">
          {memory.category}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-forest/40">
          {memory.source}
        </span>
        {memory.projectId ? (
          <span
            title={memory.projectId}
            className="max-w-[16ch] truncate rounded-md bg-paper-dim px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-forest/45"
          >
            {memory.projectId}
          </span>
        ) : null}
        {memory.branch ? (
          <span
            title={memory.branch}
            className="max-w-[16ch] truncate rounded-md bg-paper-dim px-2.5 py-1 font-mono text-[9px] tracking-[0.08em] text-forest/45"
          >
            Branch · {memory.branch}
          </span>
        ) : null}
        {memory.taskId ? (
          <span
            title={memory.taskId}
            className="max-w-[16ch] truncate rounded-md bg-paper-dim px-2.5 py-1 font-mono text-[9px] tracking-[0.08em] text-forest/45"
          >
            Task · {memory.taskId}
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-forest/35">
          {when}
        </span>
      </div>

      {memory.title ? (
        <h3 className="mt-2 text-[14px] font-semibold text-forest">
          {memory.title}
        </h3>
      ) : null}

      <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-forest/85">
        {memory.content}
      </p>

      <div className="mt-3 flex gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(memory)}
          disabled={busy}
          className={`${ICON_BTN} text-forest/55 hover:border-emerald/40 hover:text-forest`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onRetract(memory.$id)}
          disabled={busy}
          className={`${ICON_BTN} text-forest/55 hover:border-amber-400/50 hover:text-amber-300`}
        >
          Retract
        </button>
        <button
          type="button"
          onClick={() => onDelete(memory.$id)}
          disabled={busy}
          className={`${ICON_BTN} text-forest/45 hover:border-red-400/50 hover:text-red-300`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function Dashboard() {
  const { token, error: sessionError, request } = useApiSession();
  const [memories, setMemories] = useState<Fact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    content: string;
    category: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("context");
  const [adding, setAdding] = useState(false);
  const [pendingReview, setPendingReview] = useState<number | null>(null);

  /* Pure fetch; setState happens in the caller so the effect body never
     sets state synchronously (react-hooks/set-state-in-effect). */
  const fetchFacts = useCallback(
    () => request<{ memories: Fact[] }>("/memories?limit=100"),
    [request],
  );

  const load = useCallback(async () => {
    const res = await fetchFacts();
    setMemories(res.memories);
  }, [fetchFacts]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchFacts()
      .then((res) => {
        if (active) setMemories(res.memories);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load memories.");
      });
    request<{ pendingCandidates: number }>("/overview")
      .then((overview) => {
        if (active) setPendingReview(overview.pendingCandidates);
      })
      .catch(() => {
        if (active) setPendingReview(null);
      });
    return () => {
      active = false;
    };
  }, [token, fetchFacts, request]);

  async function addMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const decision = await request<SaveDecision>("/memories", {
        method: "POST",
        body: JSON.stringify({
          content: content.trim(),
          category,
          ...(title.trim() ? { title: title.trim() } : {}),
          source: "manual",
        }),
      });
      setNotice(decisionLine(decision));
      if (decision.action === "add") {
        setContent("");
        setTitle("");
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setAdding(false);
    }
  }

  async function retract(id: string) {
    if (!token) return;
    if (!confirm("Retract this fact? Agents will stop seeing it. History is kept.")) return;
    setBusyId(id);
    setError(null);
    try {
      await request(`/memories/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "invalid" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retract.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!token) return;
    if (!confirm("Delete permanently? Unlike retracting, this cannot be undone.")) return;
    setBusyId(id);
    setError(null);
    try {
      await request(`/memories/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setMemories((prev) => (prev ?? []).filter((m) => m.$id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit() {
    if (!token || !editing) return;
    setBusyId(editing.id);
    setError(null);
    try {
      await request(`/memories/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          content: editing.content.trim(),
          category: editing.category,
        }),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save edit.");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (memories ?? []).filter((m) => {
      if (categoryFilter && m.category !== categoryFilter) return false;
      if (!q) return true;
      return `${m.title ?? ""} ${m.content}`.toLowerCase().includes(q);
    });
  }, [memories, query, categoryFilter]);

  const byCategory = useMemo(
    () =>
      (memories ?? []).reduce<Record<string, number>>((acc, m) => {
        acc[m.category] = (acc[m.category] ?? 0) + 1;
        return acc;
      }, {}),
    [memories],
  );

  const banner = error ?? sessionError;

  return (
    <AppShell
      title="Memories"
      intro="Approved facts currently in recall. Inferred captures wait in the review queue until you accept them."
      wide
    >
      {banner ? (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-[13px] text-red-200"
        >
          {banner}
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

      {pendingReview && pendingReview > 0 ? (
        <p className="hairline mb-6 rounded-xl border border-emerald/25 bg-emerald/10 p-4 text-[13px] text-forest/80">
          {pendingReview} captured fact{pendingReview === 1 ? "" : "s"} waiting in the{" "}
          <Link href="/review" className="underline decoration-emerald/40 underline-offset-2">
            review queue
          </Link>
          . They are not in recall yet.
        </p>
      ) : null}

      {!token && !banner ? (
        <output
          aria-live="polite"
          className="block font-mono text-[11px] uppercase tracking-[0.1em] text-forest/45"
        >
          Authenticating…
        </output>
      ) : null}

      {token ? (
        <>
          {/* Add — runs the same pipeline as the MCP server, so the
              response may be add, duplicate or reject. */}
          <form
            onSubmit={addMemory}
            className="hairline mb-8 rounded-xl border bg-paper-dim p-4 sm:p-5"
          >
            <label htmlFor="mem-title" className="sr-only">
              Title (optional)
            </label>
            <input
              id="mem-title"
              type="text"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className={FIELD}
            />
            <label htmlFor="mem-content" className="sr-only">
              Fact
            </label>
            <textarea
              id="mem-content"
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              placeholder="One standalone fact, e.g. “This project uses Supabase for auth with row-level security.”"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className={`${FIELD} mt-2.5 h-auto resize-y py-3 leading-relaxed`}
            />

            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={category === c}
                    onClick={() => setCategory(c)}
                    className={`rounded-md px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                      category === c
                        ? "bg-forest text-paper"
                        : "hairline border bg-transparent text-forest/55 hover:text-forest"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={adding || content.trim().length < 3}
                className="ml-auto h-10 shrink-0 rounded-lg bg-emerald px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-forest-deep transition-colors hover:bg-emerald/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {adding ? "Saving…" : "Add memory"}
              </button>
            </div>
          </form>

          {memories === null ? (
            <output
              aria-live="polite"
              className="block font-mono text-[11px] uppercase tracking-[0.1em] text-forest/45"
            >
              Loading…
            </output>
          ) : memories.length === 0 ? (
            <div className="hairline rounded-xl border bg-paper p-9 text-center">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-forest">
                Nothing recorded yet
              </h2>
              <p className="mx-auto mt-1.5 max-w-sm text-[14px] text-forest/60">
                Add a fact above. Suggestions from connected agents wait in the{" "}
                <Link href="/review" className="underline decoration-emerald/40 underline-offset-2">
                  review queue
                </Link>{" "}
                until you accept them.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat value={memories.length} label="Active facts" />
                {Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([cat, count]) => (
                    <Stat key={cat} value={count} label={cat} />
                  ))}
              </div>

              <div className="mb-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <label htmlFor="mem-search" className="sr-only">
                  Search facts
                </label>
                <input
                  id="mem-search"
                  type="search"
                  placeholder="Search facts…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={`${FIELD} sm:max-w-xs`}
                />
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(null)}
                    aria-pressed={categoryFilter === null}
                    className={`rounded-md px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                      categoryFilter === null
                        ? "bg-forest text-paper"
                        : "hairline border text-forest/55 hover:text-forest"
                    }`}
                  >
                    All
                  </button>
                  {Object.keys(byCategory).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() =>
                        setCategoryFilter((cur) => (cur === cat ? null : cat))
                      }
                      aria-pressed={categoryFilter === cat}
                      className={`rounded-md px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                        categoryFilter === cat
                          ? "bg-forest text-paper"
                          : "hairline border text-forest/55 hover:text-forest"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <p className="hairline rounded-xl border bg-paper p-6 text-center text-[13px] text-forest/55">
                  Nothing matches this filter.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {filtered.map((memory) =>
                    editing?.id === memory.$id ? (
                      <li
                        key={memory.$id}
                        className="hairline rounded-xl border border-emerald/40 bg-paper-dim p-4"
                      >
                        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-emerald">
                          editing
                        </span>
                        <textarea
                          value={editing.content}
                          onChange={(e) =>
                            setEditing({ ...editing, content: e.target.value })
                          }
                          rows={3}
                          maxLength={2000}
                          aria-label="Edited fact"
                          className={`${FIELD} mt-2.5 h-auto resize-y py-3 leading-relaxed`}
                        />
                        <div className="mt-2.5 flex gap-2">
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={
                              busyId === memory.$id ||
                              editing.content.trim().length < 3
                            }
                            className="h-9 rounded-md bg-emerald px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-forest-deep disabled:opacity-60"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className={ICON_BTN}
                          >
                            Cancel
                          </button>
                        </div>
                      </li>
                    ) : (
                      <MemoryRow
                        key={memory.$id}
                        memory={memory}
                        busy={busyId === memory.$id}
                        onRetract={retract}
                        onDelete={remove}
                        onEdit={(m) =>
                          setEditing({
                            id: m.$id,
                            content: m.content,
                            category: m.category,
                          })
                        }
                      />
                    ),
                  )}
                </ul>
              )}
            </>
          )}
        </>
      ) : null}
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
