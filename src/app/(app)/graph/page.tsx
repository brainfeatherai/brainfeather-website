"use client";

/* ────────────────────────────────────────────────────────────────
   /graph — the memory graph, and now also its editor.

   Data model reminder: an edge is either memory→entity ('mentioned_in',
   created automatically by think()) or entity→entity (asserted by hand
   here). So "which memories mention this node" means incoming edges
   whose sourceId resolves to a loaded fact; a non-resolving sourceId
   stays a raw id rather than being hidden.

   Editing: nodes can be added and deleted (delete cascades to their
   edges server-side), and entity→entity links can be added and removed.
   Memory→entity links are pipeline-owned and are removable too — a
   wrong 'mentioned_in' from a misparsed fact is user-fixable here.
   ──────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { RequireAuth } from "@/components/AuthProvider";
import {
  useApiSession,
  type EdgeRow,
  type EntityRow,
  type Fact,
} from "@/lib/api-client";

const TYPE_ACCENT: Record<string, string> = {
  tool: "border border-emerald/20 bg-emerald/10 text-emerald",
  language: "border border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  concept: "border border-violet-400/20 bg-violet-400/10 text-violet-200",
  person: "border border-amber-400/20 bg-amber-400/10 text-amber-200",
  project: "border border-sky-400/20 bg-sky-400/10 text-sky-200",
  pattern: "border border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200",
};

const ENTITY_TYPES = ["tool", "language", "concept", "person", "project", "pattern"];

/* Entity→entity link vocabulary. 'mentioned_in' is reserved for the
   memory→entity links the pipeline creates. */
const EDGE_TYPES = ["related_to", "depends_on", "part_of", "uses", "contradicts", "supersedes"];

const FIELD =
  "hairline h-11 w-full rounded-lg border bg-paper px-4 text-[14px] text-forest placeholder:text-forest/35 focus:border-emerald/50 focus:outline-none focus:ring-2 focus:ring-emerald/20";

const PILL =
  "hairline rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50";

function accent(type: string): string {
  return TYPE_ACCENT[type] ?? "bg-mint/25 text-forest";
}

function GraphView() {
  const { token, error: sessionError, request } = useApiSession();
  const [entities, setEntities] = useState<EntityRow[] | null>(null);
  const [edges, setEdges] = useState<EdgeRow[] | null>(null);
  const [memories, setMemories] = useState<Fact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // Add-node form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("tool");
  const [newSummary, setNewSummary] = useState("");

  // Add-connection form (in detail panel)
  const [linkTarget, setLinkTarget] = useState("");
  const [linkType, setLinkType] = useState("related_to");

  /* Pure fetch; setState happens in the caller so the effect body never
     sets state synchronously (react-hooks/set-state-in-effect). */
  const fetchAll = useCallback(async () => {
    return Promise.all([
      request<{ entities: EntityRow[] }>("/entities"),
      request<{ edges: EdgeRow[] }>("/edges").catch(() => null),
      request<{ memories: Fact[] }>("/memories?limit=100").catch(() => null),
    ]);
  }, [request]);

  const load = useCallback(
    async () => {
      const [e, g, m] = await fetchAll();
      setEntities(e.entities);
      setEdges(g ? g.edges : []);
      setMemories(m ? m.memories : []);
    },
    [fetchAll],
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchAll()
      .then(([e, g, m]) => {
        if (!active) return;
        setEntities(e.entities);
        setEdges(g ? g.edges : []);
        setMemories(m ? m.memories : []);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load the graph.");
        setEntities([]);
        setEdges([]);
        setMemories([]);
      });
    return () => {
      active = false;
    };
  }, [token, fetchAll]);

  /* Superseded edges are filtered here because Appwrite cannot express
     `validTo IS NULL` in a query — same rule the server traversal uses. */
  const liveEdges = useMemo(
    () => (edges ?? []).filter((e) => !e.validTo),
    [edges],
  );

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of liveEdges) {
      d.set(e.sourceId, (d.get(e.sourceId) ?? 0) + 1);
      d.set(e.targetId, (d.get(e.targetId) ?? 0) + 1);
    }
    return d;
  }, [liveEdges]);

  const byType = useMemo(() => {
    const groups = new Map<string, EntityRow[]>();
    for (const ent of entities ?? []) {
      const list = groups.get(ent.type) ?? [];
      list.push(ent);
      groups.set(ent.type, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (degree.get(b.$id) ?? 0) - (degree.get(a.$id) ?? 0));
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [entities, degree]);

  const q = query.trim().toLowerCase();
  const visibleByType = useMemo(
    () =>
      byType
        .map(
          ([type, list]) =>
            [type, q ? list.filter((e) => e.name.toLowerCase().includes(q)) : list] as const,
        )
        .filter(([, list]) => list.length > 0),
    [byType, q],
  );

  const selected = useMemo(
    () => (entities ?? []).find((e) => e.$id === selectedId) ?? null,
    [entities, selectedId],
  );

  /* Connections keep their edge ids so each link is individually
     removable from the detail panel. */
  const connections = useMemo(() => {
    if (!selected) return null;
    const linked: { edgeId: string; node: EntityRow }[] = [];
    const mentionedIn: { edgeId: string; memory: Fact }[] = [];
    const unresolved: string[] = [];
    const memById = new Map((memories ?? []).map((m) => [m.$id, m]));
    const entById = new Map((entities ?? []).map((e) => [e.$id, e]));

    for (const e of liveEdges) {
      if (e.sourceId === selected.$id) {
        const other = entById.get(e.targetId);
        if (other) linked.push({ edgeId: e.$id, node: other });
        else unresolved.push(e.targetId);
      }
      if (e.targetId === selected.$id) {
        const mem = memById.get(e.sourceId);
        if (mem) mentionedIn.push({ edgeId: e.$id, memory: mem });
        else unresolved.push(e.sourceId);
      }
    }

    return { linked, mentionedIn, unresolved };
  }, [selected, liveEdges, memories, entities]);

  async function run(work: () => Promise<void>) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }

  const addNode = () =>
    run(async () => {
      await request("/entities", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          ...(newSummary.trim() ? { summary: newSummary.trim() } : {}),
        }),
      });
      setNewName("");
      setNewSummary("");
      setShowAdd(false);
    });

  const deleteNode = (id: string) => {
    if (!confirm("Delete this node and every link touching it?")) return;
    void run(async () => {
      await request(`/entities/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (selectedId === id) setSelectedId(null);
    });
  };

  const removeEdge = (edgeId: string) => {
    if (!confirm("Remove this link?")) return;
    void run(() =>
      request(`/edges/${encodeURIComponent(edgeId)}`, { method: "DELETE" }),
    );
  };

  const addLink = () =>
    run(async () => {
      await request("/edges", {
        method: "POST",
        body: JSON.stringify({
          sourceId: selectedId!,
          targetId: linkTarget,
          type: linkType,
        }),
      });
      setLinkTarget("");
    });

  const linkableEntities = (entities ?? []).filter((e) => e.$id !== selectedId);

  return (
    <AppShell
      title="Graph"
      intro="The tools, languages and concepts your facts mention — add nodes, link them, remove what does not belong."
      wide
    >
      {error ?? sessionError ? (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-[13px] text-red-200"
        >
          {error ?? sessionError}
        </p>
      ) : null}

      {entities === null && !error && !sessionError ? (
        <output
          aria-live="polite"
          className="block font-mono text-[11px] uppercase tracking-[0.1em] text-forest/45"
        >
          Loading…
        </output>
      ) : entities !== null ? (
        <>
          {/* Toolbar */}
          <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <label htmlFor="node-search" className="sr-only">
              Filter nodes
            </label>
            <input
              id="node-search"
              type="search"
              placeholder="Filter nodes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${FIELD} sm:max-w-xs`}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-forest/45">
              {entities.length} nodes · {liveEdges.length} links
            </span>
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              aria-expanded={showAdd}
              className={`${PILL} ml-auto inline-flex shrink-0 items-center gap-1.5 text-forest hover:border-emerald/40`}
            >
              <Plus size={13} aria-hidden /> Add node
            </button>
          </div>

          {/* Add-node form */}
          {showAdd ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim().length >= 1) void addNode();
              }}
              className="hairline mb-6 rounded-xl border bg-paper-dim p-4"
            >
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  required
                  type="text"
                  placeholder="Node name, e.g. Redis"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={100}
                  aria-label="Node name"
                  className={`${FIELD} sm:max-w-xs`}
                />
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  aria-label="Node type"
                  className={`${FIELD} sm:max-w-[10rem]`}
                >
                  {ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Summary (optional)"
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  maxLength={500}
                  aria-label="Node summary"
                  className={`${FIELD} flex-1`}
                />
                <button
                  type="submit"
                  disabled={busy || !newName.trim()}
                  className="h-11 shrink-0 rounded-lg bg-emerald px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-forest-deep disabled:opacity-60"
                >
                  {busy ? "…" : "Create"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Node inventory */}
            <div className="flex flex-col gap-5">
              {visibleByType.length === 0 ? (
                <p className="hairline rounded-xl border border-dashed bg-paper-dim p-6 text-center text-[13px] text-forest/55">
                  No nodes yet — add one, or save facts that mention tools.
                </p>
              ) : (
                visibleByType.map(([type, list]) => (
                  <section key={type}>
                    <h2 className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
                      {type} · {list.length}
                    </h2>
                    <ul className="flex flex-wrap gap-1.5">
                      {list.map((ent) => {
                        const active = ent.$id === selectedId;
                        return (
                          <li key={ent.$id} className="relative">
                            <button
                              type="button"
                              onClick={() => setSelectedId(active ? null : ent.$id)}
                              aria-pressed={active}
                              title={ent.summary ?? ent.name}
                              className={`rounded-md px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50 ${
                                active
                                  ? "bg-forest text-paper scale-[1.04]"
                                  : `${accent(ent.type)} hover:scale-[1.03]`
                              }`}
                            >
                              {ent.name}
                              <span className="ml-1.5 opacity-50">
                                {degree.get(ent.$id) ?? 0}
                              </span>
                            </button>
                            {active ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteNode(ent.$id);
                                }}
                                disabled={busy}
                                title={`Delete ${ent.name}`}
                                aria-label={`Delete node ${ent.name}`}
                                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-paper-dim text-forest transition-colors hover:bg-red-500 hover:text-white"
                              >
                                <X size={10} strokeWidth={2.5} aria-hidden />
                              </button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>

            {/* Detail panel */}
            <div aria-live="polite">
              {selected && connections ? (
                <aside className="hairline sticky top-20 rounded-xl border bg-paper p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${accent(selected.type)}`}
                    >
                      {selected.type}
                    </span>
                    <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-forest">
                      {selected.name}
                    </h2>
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => deleteNode(selected.$id)}
                        disabled={busy}
                        className={`${PILL} text-forest/50 hover:border-red-400/50 hover:text-red-300`}
                      >
                        Delete node
                      </button>
                      <button type="button" onClick={() => setSelectedId(null)} className={PILL}>
                        Close
                      </button>
                    </div>
                  </div>

                  {selected.summary ? (
                    <p className="mt-2.5 text-[13px] leading-relaxed text-forest/70">
                      {selected.summary}
                    </p>
                  ) : null}

                  {/* Add a link from this node */}
                  <section className="rule-t mt-4 pt-4">
                    <h3 className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
                      Link this node
                    </h3>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <select
                        value={linkType}
                        onChange={(e) => setLinkType(e.target.value)}
                        aria-label="Link type"
                        className={`${FIELD} sm:max-w-[11rem]`}
                      >
                        {EDGE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <select
                        value={linkTarget}
                        onChange={(e) => setLinkTarget(e.target.value)}
                        aria-label="Target node"
                        className={`${FIELD} flex-1`}
                      >
                        <option value="">Choose node…</option>
                        {linkableEntities.map((e) => (
                          <option key={e.$id} value={e.$id}>
                            {e.name} ({e.type})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void addLink()}
                        disabled={busy || !linkTarget}
                        className="h-11 shrink-0 rounded-lg bg-emerald px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-forest-deep disabled:opacity-60"
                      >
                        Link
                      </button>
                    </div>
                  </section>

                  <section className="rule-t mt-4 pt-4">
                    <h3 className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
                      Mentioned in · {connections.mentionedIn.length}
                    </h3>
                    {connections.mentionedIn.length === 0 ? (
                      <p className="mt-2 text-[13px] text-forest/50">
                        No active fact mentions this node.
                      </p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-2">
                        {connections.mentionedIn.map(({ edgeId, memory }) => (
                          <li
                            key={edgeId}
                            className="hairline group/mem flex items-start gap-2 rounded-lg border bg-paper-dim px-3 py-2 text-[13px] leading-relaxed text-forest/80"
                          >
                            <span className="min-w-0 flex-1">
                              {memory.title ? (
                                <span className="mr-1.5 font-semibold text-forest">
                                  {memory.title}:
                                </span>
                              ) : null}
                              {memory.content}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeEdge(edgeId)}
                              disabled={busy}
                              title="Remove this link"
                              aria-label="Remove link to this fact"
                              className="mt-0.5 shrink-0 rounded-full p-1 text-forest/35 transition-colors hover:bg-red-500/10 hover:text-red-300"
                            >
                              <X size={12} strokeWidth={2.5} aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {connections.linked.length > 0 ? (
                    <section className="rule-t mt-4 pt-4">
                      <h3 className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
                        Related nodes · {connections.linked.length}
                      </h3>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {connections.linked.map(({ edgeId, node }) => (
                          <li
                            key={edgeId}
                            className={`group/link inline-flex items-center gap-1 rounded-md py-1 pl-2.5 pr-1.5 font-mono text-[9px] uppercase tracking-[0.08em] ${accent(node.type)}`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedId(node.$id)}
                              className="hover:underline"
                            >
                              {node.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeEdge(edgeId)}
                              disabled={busy}
                              title="Remove this link"
                              aria-label={`Remove link to ${node.name}`}
                              className="rounded-full p-0.5 text-forest/40 transition-colors hover:bg-red-500/10 hover:text-red-300"
                            >
                              <X size={10} strokeWidth={2.5} aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {connections.unresolved.length > 0 ? (
                    <section className="rule-t mt-4 pt-4">
                      <h3 className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
                        Other links · {connections.unresolved.length}
                      </h3>
                      <p className="mt-2 font-mono text-[11px] leading-relaxed text-forest/45">
                        {connections.unresolved.join(", ")}
                      </p>
                    </section>
                  ) : null}
                </aside>
              ) : (
                <aside className="hairline rounded-xl border border-dashed bg-paper-dim p-6 text-center text-[13px] text-forest/55">
                  Select a node to see and edit its connections.
                </aside>
              )}
            </div>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

export default function GraphPage() {
  return (
    <RequireAuth>
      <GraphView />
    </RequireAuth>
  );
}
