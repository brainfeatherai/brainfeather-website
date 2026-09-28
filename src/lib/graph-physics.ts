/* ────────────────────────────────────────────────────────────────
   Force layout for the /nodes graph, kept free of DOM and React so it
   can be tested directly.

   Nodes repel, edges pull toward an ideal length, gravity holds the
   cloud near the origin. `alpha` cools every tick so the layout comes
   to rest and the render loop can stop instead of spinning forever.
   ──────────────────────────────────────────────────────────────── */

export type PhysicsNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
};

export type PhysicsEdge = { source: string; target: string };

export const PHYSICS = {
  repulsion: 6000,
  attraction: 0.02,
  idealLength: 120,
  gravity: 0.012,
  damping: 0.6,
  minDistance: 30,
  maxSpeed: 24,
  alphaDecay: 0.975,
  alphaMin: 0.01,
} as const;

export const NODE_RADIUS = 8;

/* The drawn radius; hit testing uses the same value so what looks
   clickable is clickable. */
export function nodeRadius(node: Pick<PhysicsNode, 'degree'>): number {
  return NODE_RADIUS + Math.min(node.degree, 10) * 0.7;
}

export function seedPositions<T extends PhysicsNode>(nodes: T[]): T[] {
  const radius = Math.min(260, 52 + nodes.length * 6);
  return nodes.map((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
    return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 };
  });
}

/* Advances the layout one step and returns the next alpha. The pinned
   node (being dragged) exerts forces but is not moved by them. */
export function tick(
  nodes: PhysicsNode[],
  edges: PhysicsEdge[],
  alpha: number,
  pinnedId?: string,
): number {
  const fx = new Float64Array(nodes.length);
  const fy = new Float64Array(nodes.length);
  const index = new Map(nodes.map((node, i) => [node.id, i]));

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) {
        /* Coincident nodes get a deterministic nudge apart. */
        const angle = ((i * 7 + j * 13) % 360) * (Math.PI / 180);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        dist = 1;
      }
      const clamped = Math.max(dist, PHYSICS.minDistance);
      const force = PHYSICS.repulsion / (clamped * clamped);
      const ux = dx / dist;
      const uy = dy / dist;
      fx[i] += ux * force;
      fy[i] += uy * force;
      fx[j] -= ux * force;
      fy[j] -= uy * force;
    }
    fx[i] -= a.x * PHYSICS.gravity;
    fy[i] -= a.y * PHYSICS.gravity;
  }

  for (const edge of edges) {
    const si = index.get(edge.source);
    const ti = index.get(edge.target);
    if (si === undefined || ti === undefined) continue;
    const source = nodes[si];
    const target = nodes[ti];
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.hypot(dx, dy) || 1;
    const force = (dist - PHYSICS.idealLength) * PHYSICS.attraction;
    fx[si] += (dx / dist) * force;
    fy[si] += (dy / dist) * force;
    fx[ti] -= (dx / dist) * force;
    fy[ti] -= (dy / dist) * force;
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.id === pinnedId) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx = (node.vx + fx[i] * alpha) * PHYSICS.damping;
    node.vy = (node.vy + fy[i] * alpha) * PHYSICS.damping;
    const speed = Math.hypot(node.vx, node.vy);
    if (speed > PHYSICS.maxSpeed) {
      node.vx = (node.vx / speed) * PHYSICS.maxSpeed;
      node.vy = (node.vy / speed) * PHYSICS.maxSpeed;
    }
    node.x += node.vx;
    node.y += node.vy;
  }

  return alpha * PHYSICS.alphaDecay;
}

export function isSettled(alpha: number): boolean {
  return alpha < PHYSICS.alphaMin;
}

/* Topmost node under the point: nodes draw in array order, so the last
   match is the one on top. */
export function hitTest<T extends PhysicsNode>(nodes: T[], x: number, y: number, slop = 6): T | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const r = nodeRadius(node) + slop;
    const dx = x - node.x;
    const dy = y - node.y;
    if (dx * dx + dy * dy <= r * r) return node;
  }
  return null;
}

export type View = { scale: number; x: number; y: number };

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/* View that fits every node, with room for labels under each one. */
export function fitView(nodes: PhysicsNode[], width: number, height: number, padding = 72): View {
  if (!nodes.length || width <= 0 || height <= 0) return { scale: 1, x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const r = nodeRadius(node);
    minX = Math.min(minX, node.x - r);
    maxX = Math.max(maxX, node.x + r);
    minY = Math.min(minY, node.y - r);
    maxY = Math.max(maxY, node.y + r + 26);
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = clampScale(
    Math.min(1.4, (width - padding * 2) / spanX, (height - padding * 2) / spanY),
  );
  return { scale, x: -((minX + maxX) / 2) * scale, y: -((minY + maxY) / 2) * scale };
}

/* Zoom by `factor` while keeping the world point under (px, py) — given
   relative to the canvas centre — fixed on screen. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}
