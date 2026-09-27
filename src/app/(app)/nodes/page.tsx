"use client";

/* ────────────────────────────────────────────────────────────────
   /nodes — force-directed graph visualization.

   Canvas-based physics simulation: nodes repel (Coulomb), edges
   attract (Hooke), center gravity pulls inward, velocity damping
   stabilises. Mouse drag moves nodes; hover shows tooltip.

   The graph fills the available warm paper canvas; node details appear
   as an overlay so the visualization does not shrink when inspected.
   ──────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LocateFixed, Network, RefreshCw, Search, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { RequireAuth } from "@/components/AuthProvider";
import {
  useApiSession,
  type ApiRequest,
  type EdgeRow,
  type EntityRow,
  type Fact,
} from "@/lib/api-client";

/* ── Colours per entity type ──────────────────────────────────── */
const TYPE_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  tool:     { fill: "#34d399", stroke: "#a7f3d0", label: "Tool" },
  language: { fill: "#60a5fa", stroke: "#bfdbfe", label: "Language" },
  concept:  { fill: "#a78bfa", stroke: "#ddd6fe", label: "Concept" },
  person:   { fill: "#fbbf24", stroke: "#fde68a", label: "Person" },
  project:  { fill: "#22d3ee", stroke: "#a5f3fc", label: "Project" },
  pattern:  { fill: "#f472b6", stroke: "#fbcfe8", label: "Pattern" },
};
const DEFAULT_COLOR = { fill: "#94a3b8", stroke: "#e2e8f0", label: "Unknown" };
const TYPE_ORDER = ["tool", "language", "concept", "person", "project", "pattern"];

const EDGE_STYLES: Record<
  string,
  { color: string; label: string; dash: number[]; directed: boolean }
> = {
  co_mentioned: { color: "#64748b", label: "Co-mentioned", dash: [], directed: false },
  related_to: { color: "#34d399", label: "Related", dash: [], directed: false },
  uses: { color: "#fbbf24", label: "Uses", dash: [], directed: true },
  depends_on: { color: "#60a5fa", label: "Depends on", dash: [6, 4], directed: true },
  part_of: { color: "#22d3ee", label: "Part of", dash: [2, 4], directed: true },
  contradicts: { color: "#f87171", label: "Contradicts", dash: [7, 4], directed: false },
  supersedes: { color: "#c084fc", label: "Supersedes", dash: [10, 4], directed: true },
};
const DEFAULT_EDGE_STYLE = EDGE_STYLES.co_mentioned;

type GraphData = {
  entities: EntityRow[];
  edges: EdgeRow[];
  memories: Fact[];
};

async function loadGraphData(
  request: ApiRequest,
  onEntities?: (entities: EntityRow[]) => void,
): Promise<GraphData> {
  const [entityResult, edgeResult, memoryResult] = await Promise.all([
    request<{ entities: EntityRow[] }>("/entities").then((result) => {
      onEntities?.(result.entities);
      return result;
    }),
    request<{ edges: EdgeRow[] }>("/edges").catch(() => null),
    request<{ memories: Fact[] }>("/memories?limit=100").catch(() => null),
  ]);

  return {
    entities: entityResult.entities,
    edges: edgeResult?.edges ?? [],
    memories: memoryResult?.memories ?? [],
  };
}

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
  type: string;
}

type TypeCount = { type: string; count: number };
type RelationCount = {
  type: string;
  count: number;
  style: (typeof EDGE_STYLES)[string];
};

function GraphLegend({
  nodeCount,
  edgeCount,
  evidenceCount,
  typeCounts,
  relationCounts,
}: {
  nodeCount: number;
  edgeCount: number;
  evidenceCount: number;
  typeCounts: TypeCount[];
  relationCounts: RelationCount[];
}) {
  const [expanded, setExpanded] = useState(true);
  const visibleRelations = relationCounts.length
    ? relationCounts
    : ["related_to", "uses", "depends_on"].map((type) => ({
        type,
        count: 0,
        style: EDGE_STYLES[type],
      }));

  return (
    <aside className="pointer-events-auto w-72 overflow-hidden rounded-xl border border-white/10 bg-[#1b1d1c]/96 shadow-[0_16px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium text-forest/85 transition-colors hover:bg-white/[0.035]"
      >
        <ChevronDown
          size={13}
          strokeWidth={1.8}
          aria-hidden
          className={`text-forest/45 transition-transform ${expanded ? "" : "-rotate-90"}`}
        />
        Legend
      </button>

      {expanded ? (
        <div className="max-h-[min(68vh,520px)] overflow-y-auto border-t border-white/[0.07] px-4 pb-4">
          <p className="mt-4 font-mono text-[8px] uppercase tracking-[0.15em] text-forest/28">
            Statistics
          </p>
          <dl className="mt-2.5 flex flex-col gap-2 text-[11px] text-forest/55">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm border border-emerald/60 bg-emerald/10" />
              <dt>Nodes</dt>
              <dd className="ml-auto font-mono text-forest/35">{nodeCount}</dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-px w-3 bg-violet-300" />
              <dt>Connections</dt>
              <dd className="ml-auto font-mono text-forest/35">{edgeCount}</dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full border border-sky-300/70" />
              <dt>Evidence</dt>
              <dd className="ml-auto font-mono text-forest/35">{evidenceCount}</dd>
            </div>
          </dl>

          <p className="mt-4 font-mono text-[8px] uppercase tracking-[0.15em] text-forest/28">
            Node types
          </p>
          {typeCounts.length ? (
            <div className="mt-2.5 flex flex-col gap-2">
              {typeCounts.map(({ type, count }) => {
                const color = TYPE_COLORS[type] ?? DEFAULT_COLOR;
                return (
                  <span key={type} className="flex items-center gap-2 text-[11px] text-forest/55">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: color.fill, color: color.fill }}
                    />
                    {color.label}
                    <span className="ml-auto font-mono text-forest/30">{count}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-forest/30">No node types yet.</p>
          )}

          <p className="mt-4 font-mono text-[8px] uppercase tracking-[0.15em] text-forest/28">
            Relationships
          </p>
          <div className="mt-2.5 flex flex-col gap-2">
            {visibleRelations.map(({ type, count, style }) => (
              <span key={type} className="flex items-center gap-2 text-[11px] text-forest/55">
                <span
                  className="w-3 border-t"
                  style={{
                    borderColor: style.color,
                    borderTopStyle: style.dash.length ? "dashed" : "solid",
                  }}
                />
                {style.label}
                <span className="ml-auto font-mono text-forest/30">{count}</span>
              </span>
            ))}
          </div>

          <p className="mt-4 font-mono text-[8px] uppercase tracking-[0.15em] text-forest/28">
            Memory status
          </p>
          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-forest/55">
            <span className="h-2 w-2 rounded-sm border border-emerald/60 bg-emerald/15" />
            Active evidence
            <span className="ml-auto font-mono text-forest/30">{evidenceCount}</span>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function tickSimulation(
  sim: SimNode[],
  edgeList: SimEdge[],
  draggedId?: string,
): void {
  const byId = new Map(sim.map((node) => [node.id, node]));

  for (const node of sim) {
    node.vx = 0;
    node.vy = 0;

    for (const other of sim) {
      if (node.id === other.id) continue;
      let dx = node.x - other.x;
      let dy = node.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist < MIN_DIST) {
        dx = (dx / dist) * MIN_DIST;
        dy = (dy / dist) * MIN_DIST;
      }
      const force = REPULSION / (dist * dist);
      node.vx += (dx / dist) * force;
      node.vy += (dy / dist) * force;
    }

    node.vx -= node.x * CENTER_GRAVITY;
    node.vy -= node.y * CENTER_GRAVITY;
  }

  for (const edge of edgeList) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - IDEAL_LENGTH) * ATTRACTION;
    source.vx += (dx / dist) * force;
    source.vy += (dy / dist) * force;
    target.vx -= (dx / dist) * force;
    target.vy -= (dy / dist) * force;
  }

  for (const node of sim) {
    if (node.id === draggedId) continue;
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;
  }
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
      className="pointer-events-none fixed z-50 max-w-xs rounded-xl border border-white/10 bg-[#121514]/95 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      style={{ left: x + 16, top: y - 8 }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: c.fill }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-forest/40">
          {c.label}
        </span>
      </div>
      <p className="mt-1 text-[14px] font-semibold text-forest">{node.name}</p>
      {node.summary ? (
        <p className="mt-1 text-[12px] leading-relaxed text-forest/60">{node.summary}</p>
      ) : null}
      <p className="mt-1 font-mono text-[10px] text-forest/30">
        {node.degree} connection{node.degree !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

/* ── Canvas graph ────────────────────────────────────────────── */
function GraphCanvas({
  nodes,
  edges,
  selectedId,
  focusIds,
  focusActive,
  resetKey,
  onSelect,
}: {
  nodes: SimNode[];
  edges: SimEdge[];
  selectedId: string | null;
  focusIds: Set<string>;
  focusActive: boolean;
  resetKey: number;
  onSelect: (node: SimNode | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef(nodes.map((n) => ({ ...n })));
  const edgesRef = useRef(edges);
  const selectedRef = useRef(selectedId);
  const focusRef = useRef(focusIds);
  const focusActiveRef = useRef(focusActive);
  const initializedRef = useRef(false);
  const resetRef = useRef(resetKey);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ node: SimNode; offsetX: number; offsetY: number } | null>(null);
  const [tooltip, setTooltip] = useState<{
    node: SimNode | null;
    x: number;
    y: number;
    visible: boolean;
  }>({ node: null, x: 0, y: 0, visible: false });

  /* Keep interaction state available to the animation frame without
     restarting the simulation every time search or selection changes. */
  useEffect(() => {
    selectedRef.current = selectedId;
    focusRef.current = focusIds;
    focusActiveRef.current = focusActive;
  }, [selectedId, focusIds, focusActive]);

  /* Initialise positions on first render or when nodes change */
  useEffect(() => {
    const shouldReset = !initializedRef.current || resetRef.current !== resetKey;
    const existing = shouldReset
      ? new Map<string, SimNode>()
      : new Map(simRef.current.map((n) => [n.id, n]));
    initializedRef.current = true;
    resetRef.current = resetKey;
    simRef.current = nodes.map((n, i) => {
      const prev = existing.get(n.id);
      if (prev) return { ...n, x: prev.x, y: prev.y, vx: 0, vy: 0 };
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      const r = Math.min(260, 52 + nodes.length * 6);
      return { ...n, x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 };
    });
    edgesRef.current = edges;
  }, [nodes, edges, resetKey]);

  /* Render loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      tickSimulation(
        simRef.current,
        edgesRef.current,
        dragRef.current?.node.id,
      );

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = rect.width / 2;
      const cy = rect.height / 2;

      ctx.clearRect(0, 0, rect.width, rect.height);

      /* Quiet drafting grid and orbital guides give the canvas spatial
         structure without competing with the graph. */
      ctx.fillStyle = "rgba(255,255,255,0.085)";
      for (let gx = cx % 34; gx < rect.width; gx += 34) {
        for (let gy = cy % 34; gy < rect.height; gy += 34) {
          ctx.beginPath();
          ctx.arc(gx, gy, 0.65, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const sim = simRef.current;
      const byId = new Map(sim.map((node) => [node.id, node]));
      const selected = selectedRef.current;
      const focus = focusRef.current;
      const hasSearch = focusActiveRef.current;
      const neighborhood = new Set<string>();
      if (selected) {
        neighborhood.add(selected);
        for (const edge of edgesRef.current) {
          if (edge.source === selected) neighborhood.add(edge.target);
          if (edge.target === selected) neighborhood.add(edge.source);
        }
      }

      ctx.save();
      ctx.setLineDash([3, 8]);
      ctx.strokeStyle = "rgba(255,255,255,0.035)";
      for (const radius of [96, 192, 288]) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      /* Draw edges */
      for (const e of edgesRef.current) {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) continue;

        const touchesSelection = !selected || e.source === selected || e.target === selected;
        const matchesSearch = !hasSearch || focus.has(e.source) || focus.has(e.target);
        const emphasized = touchesSelection && matchesSearch;
        const style = EDGE_STYLES[e.type] ?? DEFAULT_EDGE_STYLE;
        ctx.save();
        ctx.setLineDash(style.dash);
        ctx.strokeStyle = style.color + (emphasized ? "c4" : "35");
        ctx.lineWidth = emphasized ? 1.65 : 0.8;

        ctx.beginPath();
        ctx.moveTo(cx + a.x, cy + a.y);
        ctx.lineTo(cx + b.x, cy + b.y);
        ctx.stroke();

        if (style.directed && emphasized) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const targetRadius = NODE_RADIUS + Math.min(b.degree, 10) * 0.7 + 3;
          const tipX = cx + b.x - Math.cos(angle) * targetRadius;
          const tipY = cy + b.y - Math.sin(angle) * targetRadius;
          ctx.fillStyle = style.color + "d8";
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(
            tipX - Math.cos(angle - Math.PI / 6) * 7,
            tipY - Math.sin(angle - Math.PI / 6) * 7,
          );
          ctx.lineTo(
            tipX - Math.cos(angle + Math.PI / 6) * 7,
            tipY - Math.sin(angle + Math.PI / 6) * 7,
          );
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      /* Draw nodes */
      for (const n of sim) {
        const c = TYPE_COLORS[n.type] ?? DEFAULT_COLOR;
        const isSelected = n.id === selected;
        const inNeighborhood = !selected || neighborhood.has(n.id);
        const matchesSearch = !hasSearch || focus.has(n.id);
        const muted = !inNeighborhood || !matchesSearch;
        const r = NODE_RADIUS + Math.min(n.degree, 10) * 0.7 + (isSelected ? 2 : 0);

        if (isSelected || (hasSearch && focus.has(n.id))) {
          ctx.strokeStyle = c.fill + "55";
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.arc(cx + n.x, cy + n.y, r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        /* Colored core with a restrained halo. */
        ctx.globalAlpha = muted ? 0.18 : 1;
        ctx.fillStyle = c.fill;
        ctx.beginPath();
        ctx.arc(cx + n.x, cy + n.y, r, 0, Math.PI * 2);
        ctx.fill();

        /* Ring */
        ctx.strokeStyle = c.stroke;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        /* Labels sit on small paper tabs so they remain legible over
           edges without looking like a cloud of raw canvas text. */
        ctx.font = "600 10px 'Geist Mono', monospace";
        ctx.textAlign = "center";
        const labelWidth = ctx.measureText(n.name).width + 12;
        const labelX = cx + n.x - labelWidth / 2;
        const labelY = cy + n.y + r + 7;
        ctx.fillStyle = "rgba(10,12,11,0.88)";
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelWidth, 18, 6);
        ctx.fill();
        ctx.fillStyle = "rgba(238,243,241,0.86)";
        ctx.fillText(n.name, cx + n.x, labelY + 12.5);
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

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
    for (const n of simRef.current) {
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
    } else {
      onSelect(null);
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
    <div className="relative flex-1 overflow-hidden bg-[#0d100f]">
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
  rawEdges,
  allNodes,
  memories,
}: {
  node: SimNode;
  onClose: () => void;
  edges: SimEdge[];
  rawEdges: EdgeRow[];
  allNodes: EntityRow[];
  memories: Fact[];
}) {
  const nodeMap = new Map(allNodes.map((n) => [n.$id, n]));
  const memoryMap = new Map(memories.map((memory) => [memory.$id, memory]));
  const connected = edges.flatMap((edge) => {
    if (edge.source === node.id) {
      const other = nodeMap.get(edge.target);
      return other ? [{ node: other, relation: edge.type }] : [];
    }
    if (edge.target === node.id) {
      const other = nodeMap.get(edge.source);
      return other ? [{ node: other, relation: edge.type }] : [];
    }
    return [];
  });
  const evidence = rawEdges
    .filter(
      (edge) =>
        !edge.validTo && edge.type === "mentioned_in" && edge.targetId === node.id,
    )
    .flatMap((edge) => memoryMap.get(edge.sourceId) ?? [])
    .sort(
      (a, b) =>
        new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime(),
    );

  return (
    <div className="absolute bottom-4 left-4 right-4 z-20 max-h-[55%] overflow-auto rounded-2xl border border-white/10 bg-[#121514]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:left-auto sm:w-[360px] lg:bottom-auto lg:right-5 lg:top-5 lg:max-h-[76%]">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: (TYPE_COLORS[node.type] ?? DEFAULT_COLOR).fill }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-forest/40">
          {node.type}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close node details"
          className="ml-auto rounded-lg border border-white/8 bg-white/[0.035] p-1.5 text-forest/40 transition-colors hover:border-white/15 hover:text-forest"
        >
          <X size={13} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
      <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.03em] text-forest">
        {node.name}
      </h3>
      {node.summary ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-forest/60">
          {node.summary}
        </p>
      ) : null}
      {connected.length > 0 ? (
        <div className="mt-5 border-t border-forest/8 pt-4">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/40">
            Connections · {connected.length}
          </h4>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {connected.map(({ node: other, relation }) => {
              const c = TYPE_COLORS[other.type] ?? DEFAULT_COLOR;
              const relationStyle = EDGE_STYLES[relation] ?? DEFAULT_EDGE_STYLE;
              return (
                <li
                  key={`${other.$id}:${relation}`}
                  className="inline-flex items-center gap-1 rounded-md border border-white/8 bg-white/[0.035] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-forest/60"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: c.fill }} />
                  {other.name}
                  <span style={{ color: relationStyle.color }} className="ml-1 opacity-75">
                    {relationStyle.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-forest/40">No connections yet.</p>
      )}

      <div className="mt-5 border-t border-forest/8 pt-4">
        <h4 className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/40">
          Evidence · {evidence.length}
        </h4>
        {evidence.length > 0 ? (
          <ul className="mt-2.5 flex flex-col gap-2">
            {evidence.slice(0, 6).map((memory) => (
              <li
                key={memory.$id}
                className="rounded-xl border border-white/8 bg-white/[0.03] p-3"
              >
                <div className="flex items-center justify-between gap-3 font-mono text-[8px] uppercase tracking-[0.1em] text-forest/35">
                  <span>{memory.category}</span>
                  <time dateTime={memory.$createdAt}>
                    {new Date(memory.$createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                </div>
                <p className="mt-1.5 line-clamp-4 text-[11px] leading-relaxed text-forest/65">
                  {memory.content}
                </p>
                {memory.projectId ? (
                  <p
                    title={memory.projectId}
                    className="mt-2 truncate font-mono text-[8px] uppercase tracking-[0.08em] text-forest/30"
                  >
                    Project · {memory.projectId}
                  </p>
                ) : null}
                {memory.branch ? (
                  <p
                    title={memory.branch}
                    className="mt-1 truncate font-mono text-[8px] tracking-[0.08em] text-forest/30"
                  >
                    Branch · {memory.branch}
                  </p>
                ) : null}
                {memory.taskId ? (
                  <p
                    title={memory.taskId}
                    className="mt-1 truncate font-mono text-[8px] tracking-[0.08em] text-forest/30"
                  >
                    Task · {memory.taskId}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-forest/40">
            No active memory evidence is linked to this node yet.
          </p>
        )}
        {evidence.length > 6 ? (
          <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.1em] text-forest/35">
            + {evidence.length - 6} more memories
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
function NodesView() {
  const { token, error: sessionError, request } = useApiSession();
  const [entities, setEntities] = useState<EntityRow[] | null>(null);
  const [edges, setEdges] = useState<EdgeRow[] | null>(null);
  const [memories, setMemories] = useState<Fact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [query, setQuery] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [rebuilding, setRebuilding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;

    loadGraphData(request, (loadedEntities) => {
      if (active) setEntities(loadedEntities);
    })
      .then((data) => {
        if (!active) return;
        setEntities(data.entities);
        setEdges(data.edges);
        setMemories(data.memories);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load the graph.");
        setEntities([]);
        setEdges([]);
        setMemories([]);
      });
    return () => { active = false; };
  }, [token, request]);

  async function rebuildGraph() {
    if (!token || rebuilding) return;
    setRebuilding(true);
    setError(null);
    setNotice(null);

    try {
      const result = await request<{
        entities: EntityRow[];
        processed: number;
        failed: number;
      }>("/entities/backfill", { method: "POST" });
      const data = await loadGraphData(request);
      setEntities(result.entities.length ? result.entities : data.entities);
      setEdges(data.edges);
      setMemories(data.memories);
      setSelectedNode(null);
      setResetKey((value) => value + 1);
      setNotice(
        result.failed > 0
          ? `Rebuilt from ${result.processed} memories; ${result.failed} could not be processed.`
          : `Rebuilt from ${result.processed} memories.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rebuild the graph.");
    } finally {
      setRebuilding(false);
    }
  }

  const liveEdges = useMemo(
    () => (edges ?? []).filter((edge) => !edge.validTo),
    [edges],
  );

  const { simNodes, simEdges } = useMemo(() => {
    const nodes: SimNode[] = (entities ?? []).map((entity) => ({
      id: entity.$id,
      name: entity.name,
      type: entity.type,
      summary: entity.summary,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      degree: 0,
    }));

    const entityIds = new Set(nodes.map((node) => node.id));
    const simEdgeIndexes = new Map<string, number>();
    const nextEdges: SimEdge[] = [];
    const addSimEdge = (source: string, target: string, type: string) => {
      if (source === target) return;
      const key = [source, target].sort().join(":");
      const existingIndex = simEdgeIndexes.get(key);
      if (existingIndex !== undefined) {
        if (nextEdges[existingIndex].type === "co_mentioned" && type !== "co_mentioned") {
          nextEdges[existingIndex] = { source, target, type };
        }
        return;
      }
      simEdgeIndexes.set(key, nextEdges.length);
      nextEdges.push({ source, target, type });
    };

    const mentionsByMemory = new Map<string, string[]>();
    for (const edge of liveEdges) {
      if (edge.type === "mentioned_in" && entityIds.has(edge.targetId)) {
        const targets = mentionsByMemory.get(edge.sourceId) ?? [];
        targets.push(edge.targetId);
        mentionsByMemory.set(edge.sourceId, targets);
      } else if (entityIds.has(edge.sourceId) && entityIds.has(edge.targetId)) {
        addSimEdge(edge.sourceId, edge.targetId, edge.type);
      }
    }

    for (const targets of mentionsByMemory.values()) {
      const uniqueTargets = [...new Set(targets)];
      for (let i = 0; i < uniqueTargets.length; i++) {
        for (let j = i + 1; j < uniqueTargets.length; j++) {
          addSimEdge(uniqueTargets[i], uniqueTargets[j], "co_mentioned");
        }
      }
    }

    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const edge of nextEdges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (source) source.degree++;
      if (target) target.degree++;
    }

    return { simNodes: nodes, simEdges: nextEdges };
  }, [entities, liveEdges]);

  const normalizedQuery = query.trim().toLowerCase();
  const focusIds = new Set(
    normalizedQuery
      ? simNodes
          .filter((node) =>
            `${node.name} ${node.type} ${node.summary ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery),
          )
          .map((node) => node.id)
      : [],
  );

  const typeCounts = TYPE_ORDER.map((type) => ({
    type,
    count: simNodes.filter((node) => node.type === type).length,
  })).filter((group) => group.count > 0);
  const relationCounts = Object.entries(
    simEdges.reduce<Record<string, number>>((counts, edge) => {
      counts[edge.type] = (counts[edge.type] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .map(([type, count]) => ({
      type,
      count,
      style: EDGE_STYLES[type] ?? DEFAULT_EDGE_STYLE,
    }))
    .sort((a, b) => b.count - a.count);

  const isEmpty = simNodes.length === 0 && !error && !sessionError;

  return (
    <AppShell
      title="Memory Graph"
      intro="Explore the systems, tools and ideas that recur across your memory."
      wide
      immersive
    >
      {error ?? sessionError ? (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-[13px] text-red-200"
        >
          {error ?? sessionError}
        </p>
      ) : null}

      {notice ? (
        <p
          aria-live="polite"
          className="mb-6 rounded-xl border border-white/[0.10] bg-white/[0.035] p-4 text-[13px] text-forest/70"
        >
          {notice}
        </p>
      ) : null}

      {entities === null && !error && !sessionError ? (
        <output
          aria-live="polite"
          className="block font-mono text-[11px] uppercase tracking-[0.1em] text-forest/45"
        >
          Loading…
        </output>
      ) : isEmpty ? (
        <section className="relative flex min-h-[620px] h-[calc(100dvh-8rem)] max-h-[940px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d100f] shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.085)_0.7px,transparent_0.7px)] bg-[size:34px_34px]" />
          <div className="relative m-auto flex min-h-[340px] w-[min(88%,560px)] flex-col items-center justify-center rounded-xl border border-white/10 bg-[#111412]/72 px-10 py-16 text-center shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-sm">
            <Network className="mx-auto text-forest/20" size={38} strokeWidth={1.2} aria-hidden />
            <h2 className="mt-5 text-[18px] font-semibold text-forest/85">No graph data yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-forest/40">
              Save memories that mention tools, projects, people or patterns. Brainfeather will
              build the graph automatically. If a fact was saved from OpenCode before a tool
              was recognized, rebuild from memories to attach nodes like Xcode.
            </p>
            <button
              type="button"
              onClick={rebuildGraph}
              disabled={rebuilding}
              className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 font-mono text-[9px] uppercase tracking-[0.1em] text-forest/60 transition-colors hover:border-white/[0.20] hover:text-forest disabled:opacity-50"
            >
              <RefreshCw
                size={13}
                strokeWidth={1.8}
                aria-hidden
                className={rebuilding ? "animate-spin" : undefined}
              />
              {rebuilding ? "Building graph" : "Build from memories"}
            </button>
          </div>
          <div className="absolute bottom-4 left-4">
            <GraphLegend
              nodeCount={0}
              edgeCount={0}
              evidenceCount={memories?.length ?? 0}
              typeCounts={[]}
              relationCounts={[]}
            />
          </div>
        </section>
      ) : (
        <section className="relative flex min-h-[620px] h-[calc(100dvh-6rem)] max-h-[980px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d100f] shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
          <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-3 rounded-lg border border-white/[0.08] bg-[#151817]/88 px-3 py-2 shadow-[0_12px_38px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/50">
              {simNodes.length} nodes
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/35">
              {simEdges.length} links
            </span>
          </div>

          <div className="absolute right-4 top-4 z-30 flex max-w-[calc(100%-2rem)] items-center gap-2">
            <label className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
              <span className="sr-only">Search nodes</span>
              <Search
                size={14}
                strokeWidth={1.8}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-forest/35"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a node"
                className="h-9 w-full rounded-lg border border-white/[0.09] bg-[#151817]/92 pl-8 pr-8 text-[11px] text-forest shadow-[0_12px_38px_rgba(0,0,0,0.28)] outline-none backdrop-blur-xl placeholder:text-forest/25 focus:border-emerald/35"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear node search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-forest/35 hover:bg-white/[0.05] hover:text-forest"
                >
                  <X size={12} strokeWidth={1.8} aria-hidden />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              onClick={rebuildGraph}
              disabled={rebuilding}
              title="Rebuild graph"
              aria-label="Rebuild graph"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.09] bg-[#151817]/92 text-forest/45 shadow-[0_12px_38px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors hover:border-white/15 hover:text-forest disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                strokeWidth={1.8}
                aria-hidden
                className={rebuilding ? "animate-spin" : undefined}
              />
            </button>
            <button
              type="button"
              onClick={() => {
                setResetKey((value) => value + 1);
                setSelectedNode(null);
              }}
              title="Recenter graph"
              aria-label="Recenter graph"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.09] bg-[#151817]/92 text-forest/45 shadow-[0_12px_38px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors hover:border-white/15 hover:text-forest"
            >
              <LocateFixed size={14} strokeWidth={1.8} aria-hidden />
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1">
            <GraphCanvas
              nodes={simNodes}
              edges={simEdges}
              selectedId={selectedNode?.id ?? null}
              focusIds={focusIds}
              focusActive={Boolean(normalizedQuery)}
              resetKey={resetKey}
              onSelect={setSelectedNode}
            />

            <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
              <GraphLegend
                nodeCount={simNodes.length}
                edgeCount={simEdges.length}
                evidenceCount={memories?.length ?? 0}
                typeCounts={typeCounts}
                relationCounts={relationCounts}
              />
              <span className="hidden rounded-lg border border-white/8 bg-[#151817]/80 px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-forest/35 backdrop-blur-sm sm:block">
                Drag to arrange · click to inspect
              </span>
            </div>

            {normalizedQuery && focusIds.size === 0 ? (
              <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-lg border border-white/10 bg-[#151817]/95 px-4 py-2 text-[11px] text-forest/55 shadow-sm backdrop-blur-xl">
                No nodes match “{query.trim()}”
              </div>
            ) : null}

            {selectedNode ? (
              <DetailPanel
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
                edges={simEdges}
                rawEdges={liveEdges}
                allNodes={entities ?? []}
                memories={memories ?? []}
              />
            ) : null}
          </div>
        </section>
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
