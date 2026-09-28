import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fitView,
  hitTest,
  isSettled,
  MAX_SCALE,
  nodeRadius,
  seedPositions,
  tick,
  zoomAt,
  type PhysicsNode,
} from './graph-physics.ts';

function graph(count: number): PhysicsNode[] {
  return seedPositions(
    Array.from({ length: count }, (_, i) => ({ id: `n${i}`, x: 0, y: 0, vx: 0, vy: 0, degree: 1 })),
  );
}

function run(nodes: PhysicsNode[], edges: { source: string; target: string }[], pinned?: string) {
  let alpha = 1;
  let ticks = 0;
  while (!isSettled(alpha) && ticks < 2000) {
    alpha = tick(nodes, edges, alpha, pinned);
    ticks++;
  }
  return ticks;
}

test('the layout cools and stops instead of animating forever', () => {
  const nodes = graph(40);
  const edges = nodes.slice(1).map((node, i) => ({ source: nodes[i].id, target: node.id }));
  const ticks = run(nodes, edges);
  assert.ok(ticks < 400, `settled after ${ticks} ticks`);
  for (const node of nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
    assert.ok(Math.hypot(node.x, node.y) < 2000, `${node.id} stayed near the origin`);
  }
});

test('coincident nodes separate without exploding', () => {
  const nodes: PhysicsNode[] = Array.from({ length: 6 }, (_, i) => ({
    id: `n${i}`,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    degree: 0,
  }));
  run(nodes, []);
  const distinct = new Set(nodes.map((node) => `${Math.round(node.x)}:${Math.round(node.y)}`));
  assert.equal(distinct.size, nodes.length);
  for (const node of nodes) assert.ok(Math.hypot(node.x, node.y) < 1000);
});

test('a dragged node is not moved by the simulation', () => {
  const nodes = graph(10);
  const pinned = { ...nodes[3] };
  run(nodes, [], nodes[3].id);
  assert.equal(nodes[3].x, pinned.x);
  assert.equal(nodes[3].y, pinned.y);
});

test('hit testing matches the drawn radius and prefers the topmost node', () => {
  const nodes: PhysicsNode[] = [
    { id: 'below', x: 0, y: 0, vx: 0, vy: 0, degree: 10 },
    { id: 'above', x: 4, y: 0, vx: 0, vy: 0, degree: 10 },
  ];
  assert.equal(hitTest(nodes, 2, 0)?.id, 'above');
  const edge = nodeRadius(nodes[0]);
  assert.equal(hitTest([nodes[0]], -edge - 5, 0)?.id, 'below');
  assert.equal(hitTest([nodes[0]], -edge - 7, 0), null);
});

test('fitting keeps every node on screen and zoom holds the cursor point', () => {
  const nodes: PhysicsNode[] = [
    { id: 'a', x: -900, y: -400, vx: 0, vy: 0, degree: 0 },
    { id: 'b', x: 900, y: 400, vx: 0, vy: 0, degree: 0 },
  ];
  const view = fitView(nodes, 800, 600);
  for (const node of nodes) {
    const sx = node.x * view.scale + view.x;
    const sy = node.y * view.scale + view.y;
    assert.ok(Math.abs(sx) <= 400 && Math.abs(sy) <= 300);
  }

  const zoomed = zoomAt(view, 2, 120, -40);
  const before = { x: (120 - view.x) / view.scale, y: (-40 - view.y) / view.scale };
  const after = { x: (120 - zoomed.x) / zoomed.scale, y: (-40 - zoomed.y) / zoomed.scale };
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  assert.ok(zoomAt({ scale: MAX_SCALE, x: 0, y: 0 }, 4, 0, 0).scale <= MAX_SCALE);
});
