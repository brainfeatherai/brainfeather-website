"use client";

/* ────────────────────────────────────────────────────────────────
   /nodes — force-directed graph visualization.

   Canvas-based physics simulation: nodes repel (Coulomb), edges
   attract (Hooke), center gravity pulls inward, velocity damping
   stabilises. Mouse drag moves nodes; hover shows tooltip.

   Right sidebar: communities (entity types) with checkboxes to
   filter, node counts, dark theme matching forest-deep palette.
   ──────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { RequireAuth } from "@/components/AuthProvider";
import { bfFetch, useBfKey, type EdgeRow, type EntityRow } from "@/lib/api-client";

/* ── Colours per entity type ──────────────────────────────────── */
const TYPE_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  tool:     { fill: "#4ade80", stroke: "#166534", label: "Tool" },
  language: { fill: "#34d399", stroke: "#065f46", label: "Language" },
  concept:  { fill: "#a78bfa", stroke: "#5b21b6", label: "Concept" },
  person:   { fill: "#fbbf24", stroke: "#92400e", label: "Person" },
  project:  { fill: "#60a5fa", stroke: "#1e40af", label: "Project" },
  pattern:  { fill: "#f472b6", stroke: "#9d174d", label: "Pattern" },
};
const DEFAULT_COLOR = { fill: "#94a3b8", stroke: "#334155", label: "Unknown" };
const ALL_TYPES = ["tool", "language", "concept", "person", "project", "pattern"];

/* ── Physics constants ───────────────────────────────────────── */
const REPULSION = 6000;
const ATTRACTION = 0.005;
const IDEAL_LENGTH = 120;
const CENTER_GRAVITY = 0.01;
const DAMPING = 0.85;
const MIN_DIST = 30;
const NODE_RADIUS = 8;

/* ── Node position in the simulation ─────────────────────────── */
interface SimNode {
  id: string;
  name: string;
  type: string;
  summary?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
}

interface SimEdge {
  source: string;
  target: string;
}

/* ── Tooltip ─────────────────────────────────────────────────── */
function Tooltip({
  node,
  x,
  y,
  visible,
}: {
  node: SimNode | null;
  x: number;
  y: number;
  visible: boolean;
}) {
  if (!visible || !node) return null;
  const c = TYPE_COLORS[node.type] ?? DEFAULT_COLOR;
  return (
    <div
      className="pointer-events-none fixed z-50 max-w-xs rounded-xl border border-white/10 bg-[#0d1b16] px-4 py-3 shadow-xl"
      style={{ left: x + 16, top: y - 8 }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: c.fill }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40">
          {c.label}
        </span>
      </div>
      <p className="mt-1 text-[14px] font-semibold text-white">{node.name}</p>
      {node.summary ? (
        <p className="mt-1 text-[12px] leading-relaxed text-white/60">{node.summary}</p>
      ) : null}
      <p className="mt-1 font-mono text-[10px] text-white/30">
        {node.degree} connection{node.degree !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

/* ── Community sidebar ───────────────────────────────────────── */
function CommunityPanel({
  groups,
  enabled,
  onToggle,
}: {
  groups: { type: string; count: number; nodes: SimNode[] }[];
  enabled: Set<string>;
  onToggle: (type: string) => void;
}) {
  const total = groups.reduce((s, g) => s + g.count, 0);
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-0 rounded-2xl border border-white/8 bg-[#0d1b16]/80 p-4 backdrop-blur-sm">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
        Communities
      </h2>
      <p className="mt-1 font-mono text-[10px] text-white/30">
        {total} node{total !== 1 ? "s" : ""} total
      </p>
      <ul className="mt-4 flex flex-col gap-1.5">
        {groups.map((g) => {
          const c = TYPE_COLORS[g.type] ?? DEFAULT_COLOR;
          const checked = enabled.has(g.type);
          return (
            <li key={g.type}>
              <button
                type="button"
                onClick={() => onToggle(g.type)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  checked ? "bg-white/5" : "opacity-40 hover:opacity-60"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked
                      ? "border-transparent"
                      : "border-white/20"
                  }`}
                  style={checked ? { background: c.fill } : undefined}
                >
                  {checked ? (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: c.fill }}
                />
                <span className="flex-1 truncate text-[12px] font-medium text-white/80">
                  {c.label}
                </span>
                <span className="font-mono text-[11px] text-white/30">{g.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/* ── Canvas graph ────────────────────────────────────────────── */
function GraphCanvas({
  nodes,
  edges,
  enabledTypes,
  onSelect,
}: {
  nodes: SimNode[];
  edges: SimEdge[];
  enabledTypes: Set<string>;
  onSelect: (node: SimNode | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef(nodes.map((n) => ({ ...n })));
  const edgesRef = useRef(edges);
  const enabledRef = useRef(enabledTypes);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ node: SimNode; offsetX: number; offsetY: number } | null>(null);
  const [tooltip, setTooltip] = useState<{
    node: SimNode | null;
    x: number;
    y: number;
    visible: boolean;
  }>({ node: null, x: 0, y: 0, visible: false });

  /* Keep refs in sync */
  useEffect(() => {
    enabledRef.current = enabledTypes;
  }, [enabledTypes]);

  /* Initialise positions on first render or when nodes change */
  useEffect(() => {
    const existing = new Map(simRef.current.map((n) => [n.id, n]));
    simRef.current = nodes.map((n, i) => {
      const prev = existing.get(n.id);
      if (prev) return { ...n, x: prev.x, y: prev.y, vx: 0, vy: 0 };
      const angle = (i / nodes.length) * Math.PI * 2;
      const r = Math.min(300, nodes.length * 8);
      return { ...n, x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 };
    });
    edgesRef.current = edges;
  }, [nodes, edges]);

  /* Physics tick */
  const tick = useCallback(() => {
    const sim = simRef.current;
    const edgeList = edgesRef.current;
    const enabled = enabledRef.current;
    const vis = sim.filter((n) => enabled.has(n.type));
    const visIds = new Set(vis.map((n) => n.id));

    for (const a of vis) {
      a.vx = 0;
      a.vy = 0;

      /* Repulsion from every other visible node */
      for (const b of vis) {
        if (a.id === b.id) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < MIN_DIST) {
          dx = (dx / dist) * MIN_DIST;
          dy = (dy / dist) * MIN_DIST;
        }
        const force = REPULSION / (dist * dist);
        a.vx += (dx / dist) * force;
        a.vy += (dy / dist) * force;
      }

      /* Center gravity */
      a.vx -= a.x * CENTER_GRAVITY;
      a.vy -= a.y * CENTER_GRAVITY;
    }

    /* Edge attraction */
    for (const e of edgeList) {
      const a = sim.find((n) => n.id === e.source);
      const b = sim.find((n) => n.id === e.target);
      if (!a || !b || !visIds.has(a.id) || !visIds.has(b.id)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - IDEAL_LENGTH) * ATTRACTION;
      a.vx += (dx / dist) * force;
      a.vy += (dy / dist) * force;
      b.vx -= (dx / dist) * force;
      b.vy -= (dy / dist) * force;
    }

    /* Integrate */
    for (const a of vis) {
      if (dragRef.current?.node.id === a.id) continue;
      a.vx *= DAMPING;
      a.vy *= DAMPING;
      a.x += a.vx;
      a.y += a.vy;
    }
  }, []);

  /* Render loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      tick();

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = rect.width / 2;
      const cy = rect.height / 2;

      ctx.clearRect(0, 0, rect.width, rect.height);

      /* Subtle grid dots */
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let gx = cx % 40; gx < rect.width; gx += 40) {
        for (let gy = cy % 40; gy < rect.height; gy += 40) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const enabled = enabledRef.current;
      const sim = simRef.current;

      /* Draw edges */
      ctx.lineWidth = 1;
      for (const e of edgesRef.current) {
        const a = sim.find((n) => n.id === e.source);
        const b = sim.find((n) => n.id === e.target);
        if (!a || !b || !enabled.has(a.type) || !enabled.has(b.type)) continue;

        const grad = ctx.createLinearGradient(cx + a.x, cy + a.y, cx + b.x, cy + b.y);
        const ca = TYPE_COLORS[a.type] ?? DEFAULT_COLOR;
        const cb = TYPE_COLORS[b.type] ?? DEFAULT_COLOR;
        grad.addColorStop(0, ca.fill + "40");
        grad.addColorStop(1, cb.fill + "40");
        ctx.strokeStyle = grad;

        ctx.beginPath();
        ctx.moveTo(cx + a.x, cy + a.y);
        ctx.lineTo(cx + b.x, cy + b.y);
        ctx.stroke();
      }

      /* Draw nodes */
      for (const n of sim) {
        if (!enabled.has(n.type)) continue;
        const c = TYPE_COLORS[n.type] ?? DEFAULT_COLOR;
        const r = NODE_RADIUS + Math.min(n.degree, 10) * 0.6;

        /* Glow */
        ctx.shadowColor = c.fill;
        ctx.shadowBlur = 12;
        ctx.fillStyle = c.fill;
        ctx.beginPath();
        ctx.arc(cx + n.x, cy + n.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        /* Ring */
        ctx.strokeStyle = c.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();

        /* Label */
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "600 10px 'Geist Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(n.name, cx + n.x, cy + n.y - r - 4);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  /* Mouse interactions */
  const screenToSim = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  };

  const findNode = (sx: number, sy: number): SimNode | null => {
    const enabled = enabledRef.current;
    for (const n of simRef.current) {
      if (!enabled.has(n.type)) continue;
      const c = canvasRef.current?.getBoundingClientRect();
      if (!c) continue;
      const nx = c.width / 2 + n.x;
      const ny = c.height / 2 + n.y;
      const dx = sx - nx;
      const dy = sy - ny;
      const r = NODE_RADIUS + Math.min(n.degree, 10) * 0.6;
      if (dx * dx + dy * dy < (r + 6) * (r + 6)) return n;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = screenToSim(e.clientX, e.clientY);
    const node = findNode(e.clientX, e.clientY);
    if (node) {
      dragRef.current = {
        node,
        offsetX: pos.x - node.x,
        offsetY: pos.y - node.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const pos = screenToSim(e.clientX, e.clientY);
      dragRef.current.node.x = pos.x - dragRef.current.offsetX;
      dragRef.current.node.y = pos.y - dragRef.current.offsetY;
      dragRef.current.node.vx = 0;
      dragRef.current.node.vy = 0;
    } else {
      const node = findNode(e.clientX, e.clientY);
      setTooltip({
        node,
        x: e.clientX,
        y: e.clientY,
        visible: !!node,
      });
    }
  };

  const handleMouseUp = () => {
    if (dragRef.current) {
      onSelect(dragRef.current.node);
      dragRef.current = null;
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const node = findNode(e.clientX, e.clientY);
    onSelect(node);
  };

  return (
    <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/8 bg-[#0d1b16]">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
      />
      <Tooltip {...tooltip} />
    </div>
  );
}

/* ── Detail panel ────────────────────────────────────────────── */
function DetailPanel({
  node,
  onClose,
  edges,
  allNodes,
}: {
  node: SimNode;
  onClose: () => void;
  edges: EdgeRow[];
  allNodes: EntityRow[];
}) {
  const connected = edges.filter(
    (e) => (e.sourceId === node.id || e.targetId === node.id) && !e.validTo,
  );
  const nodeMap = new Map(allNodes.map((n) => [n.$id, n]));

  return (
    <div className="absolute bottom-4 left-4 right-4 z-20 max-h-[40%] overflow-auto rounded-2xl border border-white/10 bg-[#0d1b16]/95 p-5 backdrop-blur-md lg:bottom-auto lg:left-auto lg:right-4 lg:top-4 lg:max-h-[70%] lg:w-80">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: (TYPE_COLORS[node.type] ?? DEFAULT_COLOR).fill }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/40">
          {node.type}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <h3 className="mt-2 text-[17px] font-semibold text-white">{node.name}</h3>
      {node.summary ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{node.summary}</p>
      ) : null}
      {connected.length > 0 ? (
        <div className="mt-4 border-t border-white/8 pt-4">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
            Connections · {connected.length}
          </h4>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {connected.map((e) => {
              const otherId = e.sourceId === node.id ? e.targetId : e.sourceId;
              const other = nodeMap.get(otherId);
              if (!other) return null;
              const c = TYPE_COLORS[other.type] ?? DEFAULT_COLOR;
              return (
                <li
                  key={e.$id}
                  className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-white/60"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: c.fill }} />
                  {other.name}
                  <span className="text-white/25">· {e.type}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-white/40">No connections yet.</p>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
function NodesView() {
  const { key, error: keyError } = useBfKey();
  const [entities, setEntities] = useState<EntityRow[] | null>(null);
  const [edges, setEdges] = useState<EdgeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    () => new Set(ALL_TYPES),
  );
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);

  useEffect(() => {
    if (!key) return;
    let active = true;
    Promise.all([
      bfFetch<{ entities: EntityRow[] }>(key, "/entities"),
      bfFetch<{ edges: EdgeRow[] }>(key, "/edges").catch(() => null),
    ])
      .then(([e, g]) => {
        if (!active) return;
        setEntities(e.entities);
        setEdges(g ? g.edges : []);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load the graph.");
        setEntities([]);
        setEdges([]);
      });
    return () => { active = false; };
  }, [key]);

  const liveEdges = (edges ?? []).filter((e) => !e.validTo);

  /* Build sim nodes with degree */
  const degree = new Map<string, number>();
  for (const e of liveEdges) {
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  }

  const simNodes: SimNode[] = (entities ?? []).map((e) => ({
    id: e.$id,
    name: e.name,
    type: e.type,
    summary: e.summary,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    degree: degree.get(e.$id) ?? 0,
  }));

  const simEdges: SimEdge[] = liveEdges.map((e) => ({
    source: e.sourceId,
    target: e.targetId,
  }));

  /* Groups for community panel */
  const groups = ALL_TYPES
    .map((t) => ({
      type: t,
      count: simNodes.filter((n) => n.type === t).length,
      nodes: simNodes.filter((n) => n.type === t),
    }))
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count);

  const toggleType = (t: string) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const isEmpty = simNodes.length === 0 && !error && !keyError;

  return (
    <AppShell
      title="Nodes"
      intro="A force-directed view of your knowledge graph — drag nodes, filter communities, double-click to inspect."
    >
      {error ?? keyError ? (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-[13px] text-red-800"
        >
          {error ?? keyError}
        </p>
      ) : null}

      {entities === null && !error && !keyError ? (
        <output
          aria-live="polite"
          className="block font-mono text-[11px] uppercase tracking-[0.1em] text-forest/45"
        >
          Loading…
        </output>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-[15px] text-forest/60">
            No nodes yet. Save facts that mention tools, languages or concepts — they appear here automatically.
          </p>
          <p className="mt-2 font-mono text-[11px] text-forest/35">
            Or add a node manually on the Graph page.
          </p>
        </div>
      ) : (
        <div className="flex gap-4" style={{ height: "calc(100vh - 12rem)" }}>
          <GraphCanvas
            nodes={simNodes}
            edges={simEdges}
            enabledTypes={enabledTypes}
            onSelect={setSelectedNode}
          />
          <div className="hidden flex-col lg:flex">
            <CommunityPanel
              groups={groups}
              enabled={enabledTypes}
              onToggle={toggleType}
            />
          </div>
          {selectedNode ? (
            <DetailPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              edges={liveEdges}
              allNodes={entities ?? []}
            />
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

export default function NodesPage() {
  return (
    <RequireAuth>
      <NodesView />
    </RequireAuth>
  );
}
