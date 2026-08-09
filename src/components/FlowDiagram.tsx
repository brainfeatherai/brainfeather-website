import BrandIcon, { type BrandId } from "./BrandIcons";

/* ────────────────────────────────────────────────────────────────
   Isometric hub — Brainfeather as the store every agent shares.

   Two corrections over the previous version:

   1. SEMANTICS. Splitting the clients into "write on the left, recall
      on the right" was false — every client both records facts and
      reads them back. Each wire is now bidirectional: two packets
      travel it in opposite phases, and a ⇄ badge sits at the elbow.

   2. GEOMETRY. Wire endpoints previously landed ON the cube faces, so
      arrowheads drew over the tiles (the overlap in the screenshot).
      Every wire now stops BACK_OFF px short of its face anchor, along
      the wire's own direction, so the gap is uniform and nothing
      overlaps the solid.

   All endpoints are DERIVED from iso() — routes are built backwards
   from the face anchor, so node positions are a *result* of a valid
   route rather than an independent guess.
   ──────────────────────────────────────────────────────────────── */

const K = 0.8660254; // cos 30° — 2:1 isometric
const U = 44; // one cube unit, px
const OX = 520;
const OY = 300;
const N = 3; // cube is N×N×N
/* 0 = wires land FLUSH on the cube's silhouette edge. The earlier 30px
   back-off was an over-correction: it stopped arrowheads painting over
   the tiles, but left the wires floating disconnected. Flush is safe
   here because wires are painted BEFORE the cube, so the solid covers
   any sub-pixel overshoot, and a port dot on top marks the junction. */
const BACK_OFF = 0;

/** Lattice → screen. x runs right-down, z left-down, y up. */
function iso(x: number, z: number, y: number): [number, number] {
  return [OX + (x - z) * K * U, OY + (x + z) * 0.5 * U - y * U];
}

const pts = (p: [number, number][]) =>
  p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/* An iso wire runs at slope ±1/2; its unit vector is (±0.894, ±0.447). */
const UX = 0.894427;
const UY = 0.447214;

type Side = "left" | "right";

/** face anchor → back off → diagonal → horizontal → node edge */
function route(anchor: [number, number], side: Side, diag: number, horiz: number, up: boolean) {
  const sx = side === "left" ? -1 : 1;
  const sy = up ? -1 : 1;
  const [ax, ay] = anchor;

  // pull the start point off the face along the wire's own direction
  const sxp = ax + sx * BACK_OFF * UX;
  const syp = ay + sy * BACK_OFF * UY;

  const ex = ax + sx * diag;
  const ey = ay + sy * diag * 0.5;
  const nx = ex + sx * horiz;

  return {
    d: `M ${sxp.toFixed(1)} ${syp.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)} L ${nx.toFixed(1)} ${ey.toFixed(1)}`,
    elbow: [ex, ey] as [number, number],
    nodeEdge: [nx, ey] as [number, number],
  };
}

/* Anchors sit on the cube's two VERTICAL SILHOUETTE EDGES — the left
   edge is x=0 on the z=N face, the right is z=0 on the x=N face.
   This matters: a mid-face anchor is impossible to escape, because on
   the left face only x=0 projects onto the silhouette boundary (x=1.5
   lands 57px *inside* it), so any wire leaving it must cross the
   tiles no matter how far it backs off. Anchoring on the edge makes
   the clearance purely horizontal and therefore guaranteed. */
const L_ANCHORS: [number, number][] = [iso(0, N, 2.7), iso(0, N, 1.5), iso(0, N, 0.3)];
const R_ANCHORS: [number, number][] = [iso(N, 0, 2.7), iso(N, 0, 1.5), iso(N, 0, 0.3)];

type Client = {
  label: string;
  icon: BrandId;
  side: Side;
  diag: number;
  horiz: number;
  up: boolean;
  t: number;
};

/* diag + horiz is held CONSTANT (302) across all three routes, so every
   slab lands on the same x — an aligned column reads as designed, where
   the previously hand-tuned values scattered them. Solved offline
   against four constraints: ≥20px wire clearance from the silhouette,
   slabs and labels inside the viewBox, no slab/label overlap, and no
   elbow badge sitting on another route's slab. */
const CLIENTS: Client[] = [
  { label: "Claude Code", icon: "claudecode", side: "left", diag: 112, horiz: 190, up: true, t: 0 },
  { label: "Cursor", icon: "cursor", side: "left", diag: 80, horiz: 222, up: false, t: 1 },
  { label: "opencode", icon: "opencode", side: "left", diag: 232, horiz: 70, up: false, t: 2 },
  { label: "Antigravity", icon: "antigravity", side: "right", diag: 112, horiz: 190, up: true, t: 0 },
  { label: "Your agents", icon: "agents", side: "right", diag: 80, horiz: 222, up: false, t: 1 },
  { label: "MCP clients", icon: "mcp", side: "right", diag: 232, horiz: 70, up: false, t: 2 },
];

const SLAB_W = 40;
const SLAB_H = 20;
const SLAB_D = 15;

/** Map a 24×24 fill icon onto a slab's top plane, centred. */
function topPlaneMatrix(cx: number, cy: number, px = 27) {
  const s = px / 24;
  const a = K * s;
  const b = 0.5 * s;
  return `matrix(${a.toFixed(4)} ${b.toFixed(4)} ${(-a).toFixed(4)} ${b.toFixed(4)} ${cx.toFixed(1)} ${(cy - 24 * b).toFixed(1)})`;
}

function Slab({ c, i }: { c: Client; i: number }) {
  const anchor = c.side === "left" ? L_ANCHORS[c.t] : R_ANCHORS[c.t];
  const r = route(anchor, c.side, c.diag, c.horiz, c.up);
  const [ex, ey] = r.nodeEdge;
  const cx = ex + (c.side === "left" ? -SLAB_W : SLAB_W);
  const cy = ey;

  const top: [number, number][] = [
    [cx, cy - SLAB_H],
    [cx + SLAB_W, cy],
    [cx, cy + SLAB_H],
    [cx - SLAB_W, cy],
  ];

  return (
    <g className="lift" style={{ animationDelay: `${i * 0.4}s` }}>
      <polygon
        points={pts([
          [cx, cy + SLAB_D + 16],
          [cx + SLAB_W * 0.86, cy + SLAB_D + 16 + SLAB_H * 0.86],
          [cx, cy + SLAB_D + 16 + SLAB_H * 1.72],
          [cx - SLAB_W * 0.86, cy + SLAB_D + 16 + SLAB_H * 0.86],
        ])}
        fill="var(--forest)"
        opacity="0.1"
      />
      <polygon
        points={pts([
          [cx - SLAB_W, cy],
          [cx, cy + SLAB_H],
          [cx, cy + SLAB_H + SLAB_D],
          [cx - SLAB_W, cy + SLAB_D],
        ])}
        fill="var(--emerald)"
      />
      <polygon
        points={pts([
          [cx, cy + SLAB_H],
          [cx + SLAB_W, cy],
          [cx + SLAB_W, cy + SLAB_D],
          [cx, cy + SLAB_H + SLAB_D],
        ])}
        fill="var(--forest)"
      />
      <polygon points={pts(top)} fill="var(--paper)" stroke="var(--forest)" strokeWidth="1.2" />
      <polygon
        points={pts([
          [cx, cy - SLAB_H + 6],
          [cx + SLAB_W - 12, cy],
          [cx, cy + SLAB_H - 6],
          [cx - SLAB_W + 12, cy],
        ])}
        fill="none"
        stroke="var(--emerald)"
        strokeWidth="0.9"
        opacity="0.45"
      />
      <g transform={topPlaneMatrix(cx, cy)} fill="var(--forest)">
        <BrandIcon id={c.icon} />
      </g>
      <text
        x={cx}
        y={cy + SLAB_H + SLAB_D + 30}
        textAnchor="middle"
        className="font-mono"
        fontSize="11"
        letterSpacing="0.1em"
        fill="var(--forest)"
        opacity="0.8"
      >
        {c.label.toUpperCase()}
      </text>
    </g>
  );
}

export default function FlowDiagram() {
  const tiles: React.ReactElement[] = [];

  // top face — centre cell left open; the fact-cube came out of it
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      if (i === 1 && j === 1) continue;
      tiles.push(
        <polygon
          key={`t${i}${j}`}
          points={pts([iso(i, j, N), iso(i + 1, j, N), iso(i + 1, j + 1, N), iso(i, j + 1, N)])}
          fill={(i + j) % 2 ? "var(--mint)" : "var(--paper)"}
          stroke="var(--forest)"
          strokeWidth="0.9"
        />,
      );
    }
  for (let i = 0; i < N; i++)
    for (let k = 0; k < N; k++)
      tiles.push(
        <polygon
          key={`l${i}${k}`}
          points={pts([iso(i, N, k + 1), iso(i + 1, N, k + 1), iso(i + 1, N, k), iso(i, N, k)])}
          fill={(i + k) % 2 ? "var(--paper-dim)" : "var(--mint)"}
          stroke="var(--forest)"
          strokeWidth="0.9"
        />,
      );
  for (let j = 0; j < N; j++)
    for (let k = 0; k < N; k++)
      tiles.push(
        <polygon
          key={`r${j}${k}`}
          points={pts([iso(N, j, k + 1), iso(N, j + 1, k + 1), iso(N, j + 1, k), iso(N, j, k)])}
          fill={(j + k) % 2 ? "var(--emerald)" : "var(--forest)"}
          stroke="var(--forest)"
          strokeWidth="0.9"
        />,
      );

  const routes = CLIENTS.map((c) => ({
    c,
    r: route(c.side === "left" ? L_ANCHORS[c.t] : R_ANCHORS[c.t], c.side, c.diag, c.horiz, c.up),
  }));

  const FY = 5.5;
  const cubeTop: [number, number][] = [iso(1, 1, FY), iso(2, 1, FY), iso(2, 2, FY), iso(1, 2, FY)];
  const [ftx, fty] = iso(1.5, 1.5, FY);

  return (
    <svg
      viewBox="0 0 1040 640"
      className="w-full"
      role="img"
      aria-label="Brainfeather is a shared memory store sitting between your coding agents. Claude Code, Cursor, opencode, Antigravity, your own agents and other MCP clients each both record facts into it and read them back on their next run."
    >
      {/* ── wires: bidirectional, stopping clear of the cube ── */}
      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        {routes.map(({ r }, i) => (
          <g key={i}>
            <path d={r.d} stroke="var(--forest)" strokeWidth="1.1" opacity="0.26" />
            {/* one packet each way — the wire carries traffic in both
                directions, which is the corrected semantics */}
            <path
              d={r.d}
              stroke="var(--emerald)"
              strokeWidth="2.3"
              className="flow"
              style={{ animationDelay: `${i * 0.42}s` }}
            />
            <path
              d={r.d}
              stroke="var(--mint)"
              strokeWidth="2.3"
              className="flow flow-rev"
              style={{ animationDelay: `${i * 0.42 + 1.6}s` }}
            />
          </g>
        ))}
      </g>

      {/* Arrowhead at the CLIENT end only. The cube end no longer needs
          one: the wire now touches the solid, and a port dot (drawn on
          top of the cube, further down) marks the junction. An arrowhead
          there would be sliced in half by the tiles painted over it. */}
      <g fill="none" stroke="var(--emerald)" strokeWidth="1.35" opacity="0.9">
        {routes.map(({ r }, i) => {
          const [nx, ny] = r.nodeEdge;
          return (
            <g
              key={i}
              transform={`translate(${nx.toFixed(1)} ${ny.toFixed(1)}) rotate(${nx < OX ? 180 : 0})`}
            >
              <path d="M-4.2 -3.4 L2.2 0 L-4.2 3.4" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
      </g>

      {/* ⇄ badge at each elbow, stating the two-way relationship */}
      <g>
        {routes.map(({ r }, i) => {
          const [ex, ey] = r.elbow;
          return (
            <g key={i}>
              <circle cx={ex} cy={ey} r="8.5" fill="var(--paper)" stroke="var(--forest)" strokeWidth="1" />
              <g
                transform={`translate(${ex.toFixed(1)} ${ey.toFixed(1)})`}
                stroke="var(--emerald)"
                strokeWidth="1.15"
                fill="none"
                strokeLinecap="round"
              >
                <path d="M-4 -1.7 H4 M1.9 -3.6 L4 -1.7 L1.9 0.2" />
                <path d="M4 3 H-4 M-1.9 1.1 L-4 3 L-1.9 4.9" />
              </g>
            </g>
          );
        })}
      </g>

      {CLIENTS.map((c, i) => (
        <Slab key={c.label} c={c} i={i} />
      ))}

      <ellipse
        cx={OX}
        cy={OY + N * U * 0.52 + 34}
        rx={N * K * U * 0.95}
        ry={26}
        fill="var(--forest)"
        opacity="0.11"
      />

      {/* ── the store ── */}
      <g>{tiles}</g>

      {/* socket the fact-cube lifted out of. At 1 unit deep the floor is
          fully occluded by the near tile, so the opening reads as two
          interior walls meeting at a crease — shaded MIRRORED against
          the outer faces, which is what makes it read concave. */}
      <g>
        <polygon points={pts([iso(1, 1, N), iso(1, 2, N), iso(2, 2, N)])} fill="var(--forest)" />
        <polygon points={pts([iso(1, 1, N), iso(2, 1, N), iso(2, 2, N)])} fill="var(--emerald)" />
        <line
          x1={iso(1, 1, N)[0]}
          y1={iso(1, 1, N)[1]}
          x2={iso(2, 2, N)[0]}
          y2={iso(2, 2, N)[1]}
          stroke="var(--forest)"
          strokeWidth="0.9"
          opacity="0.45"
        />
        <polygon
          points={pts([iso(1, 1, N), iso(2, 1, N), iso(2, 2, N), iso(1, 2, N)])}
          fill="none"
          stroke="var(--forest)"
          strokeWidth="1.1"
        />
      </g>

      {/* ── ports ──────────────────────────────────────────────
          Drawn AFTER the cube so they sit on top of the tiles: each is
          the visible junction where a wire meets the solid. This is what
          makes a flush connection read as plugged-in rather than as a
          line that merely stops at an edge. */}
      <g>
        {[...L_ANCHORS, ...R_ANCHORS].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="5.6" fill="var(--paper)" stroke="var(--forest)" strokeWidth="1.1" />
            <circle cx={x} cy={y} r="2.2" fill="var(--emerald)" />
          </g>
        ))}
      </g>

      {/* extracted fact, hovering */}
      <g className="lift-cube">
        <polygon points={pts(cubeTop)} fill="var(--paper)" stroke="var(--forest)" strokeWidth="1.2" />
        <polygon
          points={pts([iso(1, 2, FY), iso(2, 2, FY), iso(2, 2, FY - 1), iso(1, 2, FY - 1)])}
          fill="var(--emerald)"
          stroke="var(--forest)"
          strokeWidth="1.2"
        />
        <polygon
          points={pts([iso(2, 1, FY), iso(2, 2, FY), iso(2, 2, FY - 1), iso(2, 1, FY - 1)])}
          fill="var(--forest)"
          stroke="var(--forest)"
          strokeWidth="1.2"
        />
        <image
          href="/logo-black.png"
          x={ftx - 17}
          y={fty - 19}
          width="34"
          height="34"
          preserveAspectRatio="xMidYMid meet"
          opacity="0.9"
        />
      </g>

      <g stroke="var(--forest)" strokeWidth="1" strokeDasharray="4 4" opacity="0.38" fill="none">
        {([[1, 1], [2, 1], [1, 2]] as [number, number][]).map(([a, b], i) => (
          <line
            key={i}
            x1={iso(a, b, FY - 1)[0]}
            y1={iso(a, b, FY - 1)[1]}
            x2={iso(a, b, N)[0]}
            y2={iso(a, b, N)[1]}
          />
        ))}
      </g>

      <text
        x={OX}
        y={OY + N * U + 76}
        textAnchor="middle"
        className="font-mono"
        fontSize="12.5"
        letterSpacing="0.16em"
        fill="var(--forest)"
        fontWeight="600"
      >
        BRAINFEATHER
      </text>
      <text
        x={OX}
        y={OY + N * U + 95}
        textAnchor="middle"
        className="font-mono"
        fontSize="9.5"
        letterSpacing="0.11em"
        fill="var(--forest)"
        opacity="0.6"
      >
        THE SHARED MEMORY STORE
      </text>

      {/* one honest legend, replacing the false write/recall split */}
      <g transform={`translate(${OX} 40)`}>
        <rect x="-146" y="-15" width="292" height="27" rx="13.5" fill="var(--paper-dim)" stroke="var(--forest)" strokeWidth="0.9" strokeOpacity=".14" />
        <g stroke="var(--emerald)" strokeWidth="1.2" fill="none" strokeLinecap="round" transform="translate(-126 -1.5)">
          <path d="M-5 -2.2 H5 M2.6 -4.5 L5 -2.2 L2.6 0.1" />
          <path d="M5 3.8 H-5 M-2.6 1.5 L-5 3.8 L-2.6 6.1" />
        </g>
        <text x="8" y="3" textAnchor="middle" className="font-mono" fontSize="9.5" letterSpacing="0.1em" fill="var(--forest)" opacity=".75">
          EVERY CLIENT WRITES AND RECALLS
        </text>
      </g>
    </svg>
  );
}
