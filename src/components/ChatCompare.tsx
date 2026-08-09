"use client";

import { useEffect, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────────
   Two Claude Code sessions replaying on ONE shared clock — the same
   request, with and without the Brainfeather MCP server connected.

   Fidelity notes, because the details are what make it read as real:
   · cost is reported by the HARNESS status line
       `· Cogitating… (5.2s · ↓ 1.5k tokens)`
     never spoken by Claude. An assistant announcing its own token
     bill is something no real session does.
   · `●` for turns and tool calls, `└` for continuation, and
     `… +N lines (ctrl+o to expand)` where output is collapsed
   · `❯` prompt, and a context-usage strip along the bottom
   · tool calls print as `Tool(args)`; MCP tools as `server - tool`

   The shared clock is the argument: the right session settles at
   ~2.6s while the left is still re-asking at ~5.2s. You watch the
   round-trips burn instead of reading "4 turns".
   ──────────────────────────────────────────────────────────────── */

type Line = { n: number; t: string; tone?: "dim" | "key" | "str" | "bad" };

/* `tok` = cumulative tokens billed once this row exists. Calls are
   stateless, so every turn re-sends the whole history — four turns
   cost the sum of a growing context, not 4× one turn. */
type Row = { at: number; tok: number } & (
  | { k: "prompt"; text: string }
  | { k: "say"; text: string }
  | { k: "ask"; items: string[] }
  | { k: "human"; text: string }
  | {
      k: "tool";
      name: string;
      args?: string;
      mcp?: boolean;
      result: string;
      more?: number;
      ok?: boolean;
    }
  | { k: "facts"; rows: [string, string][] }
  | { k: "write"; file: string; head: string; lines: Line[]; more?: number }
  | { k: "note"; text: string; bad?: boolean }
);

/* Real Claude Code spinner words. */
const SPINNER = ["Cogitating", "Noodling", "Percolating", "Ruminating", "Beboppin'"];

/** 1542 → "1.5k", 489 → "489" — the CLI's own abbreviation. */
function tokfmt(n: number) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
}

/** Deterministic, so SSR and client agree (no Intl, no locale drift). */
function secs(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

const PROMPT = "i'm creating a new app — set up the backend";

const WITHOUT: Row[] = [
  { at: 0, tok: 12, k: "prompt", text: PROMPT },
  { at: 600, tok: 40, k: "say", text: "Before I scaffold anything — a few questions:" },
  {
    at: 1100,
    tok: 84,
    k: "ask",
    items: [
      "Which backend — Supabase, Firebase, something custom?",
      "Managed auth, or your own?",
      "Where should generated files live?",
    ],
  },
  { at: 2100, tok: 271, k: "human", text: "…you re-type your whole stack. Again." },
  {
    at: 3200,
    tok: 498,
    k: "tool",
    name: "Glob",
    args: 'pattern: "**/*.config.*"',
    result: "No files found",
  },
  {
    at: 4100,
    tok: 1542,
    k: "write",
    file: "src/data/repository.ts",
    head: "Added 47 lines",
    more: 43,
    lines: [
      { n: 1, t: "import { Orm } from '@orm/client'", tone: "bad" },
      { n: 2, t: "" },
      { n: 3, t: "export class DataRepositoryService {", tone: "key" },
      { n: 4, t: "  private orm = new Orm()" },
    ],
  },
  {
    at: 5200,
    tok: 1542,
    k: "note",
    text: "an ORM, a service class, a folder you don't use",
    bad: true,
  },
];

const WITH: Row[] = [
  { at: 0, tok: 12, k: "prompt", text: PROMPT },
  {
    at: 450,
    tok: 59,
    k: "tool",
    name: "brainfeather - search_memory",
    args: 'query: "backend setup"',
    mcp: true,
    result: "Found 4 facts",
    ok: true,
  },
  {
    at: 950,
    tok: 154,
    k: "facts",
    rows: [
      ["backend", "Supabase · Postgres"],
      ["auth", "Supabase Auth + RLS"],
      ["testing", "Vitest · colocated *.test.ts"],
      ["convention", "thin repositories, no ORM"],
    ],
  },
  { at: 1400, tok: 190, k: "say", text: "Your Supabase client, thin repository:" },
  {
    at: 1800,
    tok: 489,
    k: "write",
    file: "src/repositories/user.ts",
    head: "Added 24 lines",
    more: 17,
    lines: [
      { n: 1, t: "import { supabase } from '@/lib/supabase'", tone: "key" },
      { n: 2, t: "" },
      { n: 3, t: "export const userRepo = {" },
      { n: 4, t: "  findById: (id: string) =>" },
      { n: 5, t: "    supabase.from('users')", tone: "str" },
      { n: 6, t: "      .select().eq('id', id).single()," , tone: "str" },
      { n: 7, t: "}" },
    ],
  },
  { at: 2600, tok: 489, k: "note", text: "your provider, your conventions, your file layout" },
];

const LAST_L = WITHOUT[WITHOUT.length - 1].at;
const LAST_R = WITH[WITH.length - 1].at;
const END = Math.max(LAST_L, LAST_R) + 900;

/* Both meters divide by the SAME peak, so the bars are directly
   comparable — that shared denominator is what makes 3× legible. */
const PEAK = Math.max(...WITHOUT.map((r) => r.tok), ...WITH.map((r) => r.tok));

/* ── atoms ───────────────────────────────────────────────── */

/* Real Claude Code shows a filled dot for any tool that *ran* —
   wrongness lives in the diff, not in a recoloured marker. */
function Dot({ tone }: { tone: "mint" | "dim" }) {
  return (
    <span
      className={`mt-[6.5px] h-[6px] w-[6px] shrink-0 rounded-full ${
        tone === "mint" ? "bg-mint" : "bg-paper/45"
      }`}
      aria-hidden="true"
    />
  );
}

const TONE: Record<string, string> = {
  dim: "text-paper/35",
  key: "text-mint/85",
  str: "text-mint/70",
  bad: "text-red-300/80",
};

function Expand({ n }: { n: number }) {
  return (
    <p className="mt-0.5 pl-[16px] font-mono text-[10.5px] leading-[1.6] text-paper/28">
      … +{n} lines <span className="text-paper/22">(ctrl+o to expand)</span>
    </p>
  );
}

function Reveal({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`transition-[opacity,transform] duration-400 ease-out ${
        on ? "translate-y-0 opacity-100" : "translate-y-[5px] opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

function RowView({ r }: { r: Row }) {
  if (r.k === "prompt") {
    return (
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11.5px] text-paper/45" aria-hidden="true">
          ❯
        </span>
        <span className="font-mono text-[11.5px] leading-[1.7] text-paper/90">{r.text}</span>
      </div>
    );
  }

  if (r.k === "say") {
    return (
      <div className="flex gap-2">
        <Dot tone="mint" />
        <p className="font-mono text-[11.5px] leading-[1.7] text-paper/85">{r.text}</p>
      </div>
    );
  }

  if (r.k === "ask") {
    return (
      <div className="flex flex-col gap-1 pl-[16px]">
        {r.items.map((t) => (
          <div key={t} className="flex gap-2">
            <span className="font-mono text-[11px] text-paper/25" aria-hidden="true">
              └
            </span>
            <span className="font-mono text-[11px] leading-[1.65] text-paper/55">{t}</span>
          </div>
        ))}
      </div>
    );
  }

  if (r.k === "human") {
    return (
      <div className="ml-[16px] border-l border-dashed border-paper/20 pl-2.5">
        <span className="font-mono text-[11px] italic leading-[1.7] text-paper/40">{r.text}</span>
      </div>
    );
  }

  if (r.k === "tool") {
    return (
      <div className="flex gap-2">
        <Dot tone={r.ok ? "mint" : "dim"} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11.5px] leading-[1.6]">
            <span className={`font-semibold ${r.ok ? "text-mint" : "text-paper/90"}`}>
              {r.name}
            </span>
            {r.args && (
              <span className="text-paper/45">
                ({r.args})
              </span>
            )}
          </p>
          <p className="mt-0.5 flex gap-2 font-mono text-[11px] leading-[1.6]">
            <span className="text-paper/25" aria-hidden="true">
              └
            </span>
            <span className={r.ok ? "text-mint/75" : "text-paper/45"}>{r.result}</span>
          </p>
        </div>
      </div>
    );
  }

  if (r.k === "facts") {
    return (
      <div className="ml-[16px] overflow-hidden rounded border border-mint/25 bg-mint/8">
        <dl className="divide-y divide-mint/12">
          {r.rows.map(([k, v]) => (
            <div key={k} className="flex gap-3 px-2.5 py-[6px]">
              <dt className="w-[76px] shrink-0 font-mono text-[10px] leading-[1.6] text-mint/55">
                {k}
              </dt>
              <dd className="min-w-0 font-mono text-[10px] leading-[1.6] text-mint/95">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  if (r.k === "write") {
    return (
      <div className="flex gap-2">
        <Dot tone="mint" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11.5px] leading-[1.6]">
            <span className="font-semibold text-paper/90">Write</span>
            <span className="text-paper/45">({r.file})</span>
          </p>
          <p className="mt-0.5 flex gap-2 font-mono text-[11px] leading-[1.6]">
            <span className="text-paper/25" aria-hidden="true">
              └
            </span>
            <span className="text-paper/50">{r.head}</span>
          </p>
          <div className="mt-1.5 overflow-x-auto rounded border border-paper/8 bg-black/30 px-2 py-1.5">
            {r.lines.map((l) => (
              <div key={l.n} className="flex gap-2.5">
                <span className="w-[16px] shrink-0 select-none text-right font-mono text-[10px] leading-[1.85] text-paper/22">
                  {l.n}
                </span>
                <span
                  className={`whitespace-pre font-mono text-[10.5px] leading-[1.85] ${
                    l.tone ? TONE[l.tone] : "text-paper/70"
                  }`}
                >
                  {l.t || " "}
                </span>
              </div>
            ))}
          </div>
          {r.more ? <Expand n={r.more} /> : null}
        </div>
      </div>
    );
  }

  return (
    <p
      className={`pl-[16px] font-mono text-[10px] leading-[1.65] ${
        r.bad ? "text-red-300/55" : "text-mint/65"
      }`}
    >
      {r.bad ? "✗ " : "✓ "}
      {r.text}
    </p>
  );
}

/* ── panel ───────────────────────────────────────────────── */

function Term({
  live,
  rows,
  turns,
  elapsed,
  lastAt,
  ready,
}: {
  live: boolean;
  rows: Row[];
  turns: string;
  elapsed: number;
  lastAt: number;
  /* false until hydration: render the finished transcript so the
     server HTML and no-JS clients aren't a wall of invisible rows */
  ready: boolean;
}) {
  const settled = !ready || elapsed >= lastAt;
  const visible = ready ? rows.filter((r) => elapsed >= r.at) : rows;
  const tokNow = visible.length ? visible[visible.length - 1].tok : 0;
  const shown = Math.min(ready ? elapsed : lastAt, lastAt);
  const pct = Math.round((tokNow / PEAK) * 100);

  /* Derived from `elapsed`, never random — a Math.random() spinner
     would differ between server and client and trip hydration. */
  const word = SPINNER[Math.floor(shown / 1100) % SPINNER.length];

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border bg-[#0b0f0d] shadow-[0_20px_54px_-24px_rgba(13,38,32,0.55)] ${
        live ? "border-mint/30" : "border-paper/12"
      }`}
    >
      {/* title bar */}
      <div className="flex items-center gap-2.5 border-b border-paper/8 px-3 py-2">
        <div className="flex items-center gap-[5px]" aria-hidden="true">
          {["bg-paper/22", "bg-paper/14", "bg-paper/14"].map((c, i) => (
            <span key={i} className={`h-[7px] w-[7px] rounded-full ${c}`} />
          ))}
        </div>
        <span className="ml-1 truncate font-mono text-[9.5px] tracking-[0.03em] text-paper/40">
          claude — ~/projects/my-app
        </span>
        <span
          className={`ml-auto shrink-0 rounded px-1.5 py-[2px] font-mono text-[8px] font-semibold uppercase tracking-[0.09em] ${
            live ? "bg-mint/18 text-mint" : "bg-paper/8 text-paper/35"
          }`}
        >
          {live ? "mcp: brainfeather" : "no mcp"}
        </span>
      </div>

      {/* transcript */}
      <div className="flex flex-1 flex-col gap-3 px-3 py-3.5">
        {rows.map((r, i) => (
          <Reveal key={i} on={!ready || elapsed >= r.at}>
            <RowView r={r} />
          </Reveal>
        ))}
      </div>

      {/* ── harness status line: this is where cost is reported ── */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 pb-2.5 pt-1">
        <span
          className={`font-mono text-[11px] ${settled ? "text-paper/30" : "text-orange-300/85"}`}
          aria-hidden="true"
        >
          ·
        </span>
        <span
          className={`font-mono text-[11px] ${
            settled ? "text-paper/35" : "text-orange-300/85"
          }`}
        >
          {settled ? "Done" : `${word}…`}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-paper/35">
          ({secs(shown)} · ↓ {tokfmt(tokNow)} tokens)
        </span>
        <span
          className={`ml-auto font-mono text-[9.5px] uppercase tracking-[0.09em] ${
            live ? "text-mint/80" : "text-paper/35"
          }`}
        >
          {turns}
        </span>
      </div>

      {/* prompt */}
      <div className="relative flex items-center gap-2 border-t border-paper/8 px-3 py-2.5">
        {/* comparative token bar rides the border — no extra band */}
        <span
          className={`absolute left-0 top-0 h-[2px] transition-[width] duration-500 ease-out ${
            live ? "bg-mint/70" : "bg-paper/30"
          }`}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
        <span className="font-mono text-[11.5px] text-paper/45" aria-hidden="true">
          ❯
        </span>
        <span className="caret h-[13px] w-[1.5px] bg-paper/60" aria-hidden="true" />
        <span className="ml-auto font-mono text-[8.5px] tracking-[0.04em] text-paper/22">
          {live ? "12% context used" : "38% context used"}
        </span>
      </div>
    </div>
  );
}

/* ── shared clock ────────────────────────────────────────── */

export default function ChatCompare() {
  const host = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  /* Replay counter. Bumping it re-runs the clock effect below, which
     restarts playback from t0 — cheaper than resetting `phase`, which
     would re-arm the observer too. */
  const [run, setRun] = useState(0);
  /* "static" = finished transcript. It's the SSR/no-JS state AND the
     reduced-motion state, so server HTML is never invisible rows. */
  const [phase, setPhase] = useState<"static" | "armed" | "playing">("static");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let io: IntersectionObserver | undefined;

    /* Deferred a frame so hydration settles against the server's
       fully-visible markup before anything is hidden. */
    const raf = requestAnimationFrame(() => {
      if (mq.matches) return; // stay static — no playback
      setPhase("armed");
      /* threshold MUST stay 0: on a short viewport the stacked mobile
         layout is taller than the screen, so a fractional ratio is
         unreachable and playback would never start. */
      io = new IntersectionObserver(
        (es) => {
          if (es.some((e) => e.isIntersecting)) {
            setPhase("playing");
            io?.disconnect();
          }
        },
        { threshold: 0, rootMargin: "0px 0px -12% 0px" },
      );
      io.observe(el);
    });

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    const t0 = performance.now();
    let raf = 0;
    let timer = 0;
    const tick = () => {
      const e = performance.now() - t0;
      setElapsed(e);
      if (e < END) timer = window.setTimeout(tick, 70);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    /* `run` in the deps is what makes Replay work: incrementing it
       re-runs this effect, which resets t0 and replays the transcript. */
  }, [phase, run]);

  const done = elapsed >= END;

  return (
    <div ref={host}>
      <div className="grid items-stretch gap-5 lg:grid-cols-2 lg:gap-6">
        <Term
          live={false}
          rows={WITHOUT}
          turns="4 turns"
          elapsed={elapsed}
          lastAt={LAST_L}
          ready={phase !== "static"}
        />
        <Term
          live
          rows={WITH}
          turns="1 turn"
          elapsed={elapsed}
          lastAt={LAST_R}
          ready={phase !== "static"}
        />
      </div>

      {/* Just the replay control, centred, with no rule above it — the
          transcripts end in their own card edges, so a section rule a
          few px below them was a second horizontal line saying nothing.

          `pt-5` went with the rule (its only job was clearance from it);
          the margin alone now carries the gap. Still gated on hydration
          rather than only the button: with no JS there is no playback to
          replay, and the wrapper would be empty padding. */}
      {phase !== "static" && (
        <div className="mt-10 flex justify-center px-6 sm:px-7">
          <button
            type="button"
            onClick={() => setRun((r) => r + 1)}
            disabled={!done}
            className="hairline flex shrink-0 items-center gap-2 rounded-full border bg-paper px-3.5 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.11em] text-forest transition-colors hover:bg-mint/25 disabled:opacity-30"
          >
            <span aria-hidden="true">↻</span>
            Replay
          </button>
        </div>
      )}
    </div>
  );
}
