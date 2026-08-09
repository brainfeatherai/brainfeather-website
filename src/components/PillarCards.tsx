import Reveal from "./Reveal";

/* ────────────────────────────────────────────────────────────────
   Four capability cards. Each diagram shows the MECHANISM with real
   content — actual message text, real client names, the actual fact
   being stored — rather than lettered boxes. The previous versions
   used empty pills and A/B/C placeholders, which made every card look
   like the same generic flowchart.

   All four share one 240×140 stage, one stroke weight, and one type
   scale, so they read as a set. The art itself is still pure SVG with
   no client JS; only the <Reveal> wrapper below is a client component,
   so the diagrams render on the server as before. One `pulse` element
   per card, covered by prefers-reduced-motion.

   Mono advance is ~0.6em, so a string at font size f is ≈ 0.6·f·len
   wide — every box below is sized from that, not eyeballed.
   ──────────────────────────────────────────────────────────────── */

const S = { fill: "none", stroke: "var(--forest)", strokeWidth: 1 } as const;
const MONO = "font-mono";

/** width of `n` monospace chars at font size `f` */
const w = (n: number, f = 6) => n * f * 0.6;

/* ── 01 · background capture ───────────────────────────────
   The point is that the session never waits. Top lane keeps running
   (+0 ms); a copy drops into the queue below, where a worker extracts
   the fact on its own time. */
function CaptureArt() {
  const turns = ["set up auth", "use RLS", "no ORM"];
  return (
    <svg viewBox="0 0 240 140" className="w-full" aria-hidden="true">
      {/* live session lane */}
      <text x="10" y="15" className={MONO} fontSize="5.5" letterSpacing=".12em" fill="var(--forest)" opacity=".45">
        YOUR SESSION
      </text>
      {turns.map((t, i) => (
        <g key={t}>
          <rect x={10 + i * 62} y="20" width="54" height="17" rx="4" {...S} />
          <text x={37 + i * 62} y="31.5" textAnchor="middle" className={MONO} fontSize="6" fill="var(--forest)" opacity=".8">
            {t}
          </text>
        </g>
      ))}
      {/* lane continues, uninterrupted */}
      <path d="M198 28.5 L222 28.5" {...S} strokeWidth="1.1" />
      <path d="M218 25.5 L222 28.5 L218 31.5" {...S} strokeWidth="1.1" />
      <rect x="196" y="42" width="38" height="14" rx="7" fill="var(--forest)" />
      <text x="215" y="51.5" textAnchor="middle" className={MONO} fontSize="6" fill="var(--paper)">
        +0 ms
      </text>

      {/* a copy falls to the queue — the only coupling between lanes */}
      <path d="M99 39 L99 66" stroke="var(--emerald)" strokeWidth="1" strokeDasharray="3 3" fill="none" />
      <path d="M96 62 L99 66 L102 62" stroke="var(--emerald)" strokeWidth="1" fill="none" />

      {/* async boundary */}
      <path d="M10 62 L86 62 M112 62 L230 62" stroke="var(--forest)" strokeWidth=".7" strokeDasharray="2 4" opacity=".35" fill="none" />
      <text x="99" y="60" textAnchor="middle" className={MONO} fontSize="5.5" letterSpacing=".1em" fill="var(--forest)" opacity=".4">
        ASYNC
      </text>

      {/* queue → worker → fact */}
      <rect x="10" y="74" width="46" height="52" rx="5" {...S} fill="var(--paper-dim)" />
      <text x="33" y="134" textAnchor="middle" className={MONO} fontSize="5.5" letterSpacing=".1em" fill="var(--forest)" opacity=".5">
        QUEUE
      </text>
      {[0, 1, 2].map((i) => (
        <rect key={i} x="16" y={80 + i * 15} width="34" height="11" rx="2.5" fill="var(--mint)" opacity={0.9 - i * 0.22} />
      ))}

      <path d="M60 100 L78 100" {...S} strokeWidth="1.1" />
      <path d="M74 97 L78 100 L74 103" {...S} strokeWidth="1.1" />

      <rect x="80" y="86" width="52" height="28" rx="5" stroke="var(--emerald)" strokeWidth="1.1" fill="var(--mint)" fillOpacity=".3" />
      <text x="106" y="98" textAnchor="middle" className={MONO} fontSize="6" fill="var(--forest)">
        extract
      </text>
      <circle cx="106" cy="107" r="2.6" fill="var(--emerald)" className="pulse" />

      <path d="M136 100 L154 100" {...S} strokeWidth="1.1" />
      <path d="M150 97 L154 100 L150 103" {...S} strokeWidth="1.1" />

      <rect x="156" y="88" width="76" height="24" rx="4" stroke="var(--forest)" strokeWidth="1" fill="var(--paper)" />
      <text x="163" y="98" className={MONO} fontSize="5.5" fill="var(--forest)" opacity=".55">
        auth
      </text>
      <text x="163" y="107" className={MONO} fontSize="6" fill="var(--forest)">
        Supabase · RLS
      </text>
    </svg>
  );
}

/* ── 02 · invalidation ─────────────────────────────────────
   Not just "old fact struck out" — the consequence is that a later
   search returns ONE row. That's the part worth drawing. */
function ReplaceArt() {
  return (
    <svg viewBox="0 0 240 140" className="w-full" aria-hidden="true">
      {/* retired */}
      <g opacity=".5">
        <rect x="26" y="12" width="150" height="24" rx="4" {...S} strokeDasharray="4 3" />
        <text x="36" y="27" className={MONO} fontSize="6" fill="var(--forest)" opacity=".6">
          backend
        </text>
        <text x="86" y="27" className={MONO} fontSize="7" fill="var(--forest)">
          Firebase
        </text>
        {/* rule crosses the VALUE only: 8 chars at 7px ≈ 33.6px from x=85 */}
        <line x1="84" y1="24.6" x2="121" y2="24.6" stroke="var(--forest)" strokeWidth="1" />
      </g>
      <g>
        <rect x="182" y="17" width="44" height="14" rx="3" fill="var(--paper-dim)" stroke="var(--forest)" strokeWidth=".8" strokeOpacity=".3" />
        <text x="204" y="26.5" textAnchor="middle" className={MONO} fontSize="5.5" letterSpacing=".08em" fill="var(--forest)" opacity=".5">
          INVALID
        </text>
      </g>

      {/* supersede */}
      <path d="M101 38 L101 50" {...S} />
      <path d="M98 46 L101 50 L104 46" {...S} />
      <text x="108" y="47" className={MONO} fontSize="5.5" letterSpacing=".06em" fill="var(--forest)" opacity=".4">
        superseded
      </text>

      {/* current */}
      <rect x="26" y="52" width="150" height="26" rx="4" stroke="var(--emerald)" strokeWidth="1.2" fill="var(--mint)" fillOpacity=".3" />
      <text x="36" y="68" className={MONO} fontSize="6" fill="var(--forest)" opacity=".6">
        backend
      </text>
      <text x="86" y="68" className={MONO} fontSize="7" fontWeight="600" fill="var(--forest)">
        Supabase
      </text>
      <circle cx="166" cy="65" r="2.8" fill="var(--emerald)" className="pulse" />

      {/* the consequence */}
      <path d="M26 90 L214 90" stroke="var(--forest)" strokeWidth=".7" strokeDasharray="2 4" opacity=".3" fill="none" />
      <text x="26" y="104" className={MONO} fontSize="6" fill="var(--forest)" opacity=".55">
        search_memory(
      </text>
      <text x="26" y="113" className={MONO} fontSize="6" fill="var(--emerald)">
        &quot;backend&quot;)
      </text>
      <path d="M92 108 L114 108" {...S} strokeWidth="1.1" stroke="var(--emerald)" />
      <path d="M110 105 L114 108 L110 111" {...S} strokeWidth="1.1" stroke="var(--emerald)" />
      <rect x="118" y="98" width="96" height="21" rx="4" stroke="var(--emerald)" strokeWidth="1.1" fill="var(--mint)" fillOpacity=".3" />
      <text x="166" y="112" textAnchor="middle" className={MONO} fontSize="6.5" fill="var(--forest)">
        1 row · Supabase
      </text>
      <text x="166" y="131" textAnchor="middle" className={MONO} fontSize="5.5" letterSpacing=".08em" fill="var(--forest)" opacity=".4">
        FIREBASE NEVER RETURNS
      </text>
    </svg>
  );
}

/* ── 03 · noise filter ─────────────────────────────────────
   A tapered funnel, not a dotted line: chatter passes through and
   falls away, durable facts land in the store. */
function FilterArt() {
  const feed = [
    { t: "morning!", keep: false },
    { t: "we use Vitest", keep: true },
    { t: "haha nice", keep: false },
    { t: "no ORM, ever", keep: true },
  ];
  return (
    <svg viewBox="0 0 240 140" className="w-full" aria-hidden="true">
      {feed.map((it, i) => (
        <g key={it.t} opacity={it.keep ? 1 : 0.4}>
          <rect
            x="8"
            y={10 + i * 25}
            width="84"
            height="18"
            rx="4"
            {...S}
            strokeDasharray={it.keep ? undefined : "3 3"}
          />
          <text x={14} y={22 + i * 25} className={MONO} fontSize="6.5" fill="var(--forest)">
            {it.t}
          </text>
        </g>
      ))}

      {/* funnel */}
      <path d="M100 6 L128 46 L128 94 L100 134 Z" fill="var(--paper-dim)" stroke="var(--forest)" strokeWidth="1" />
      <text
        x="114"
        y="72"
        textAnchor="middle"
        className={MONO}
        fontSize="5.5"
        letterSpacing=".14em"
        fill="var(--forest)"
        opacity=".55"
        transform="rotate(-90 114 72)"
      >
        FILTER
      </text>

      {/* Kept items enter the funnel at their OWN height (short stub to
          the left edge), then leave from the right edge. Routing along
          the edges rather than diagonally across the face matters: a
          diagonal from the feed box to the right edge crossed the
          rotated FILTER label at y≈83. Stub y-values are the feed box
          centres (10+i·25+9), not the box tops. */}
      {[
        { cy: 44, out: 52, label: "testing  Vitest" },
        { cy: 94, out: 74, label: "orm      none" },
      ].map((k, i) => (
        <g key={k.label}>
          <path d={`M92 ${k.cy} L100 ${k.cy}`} stroke="var(--emerald)" strokeWidth="1.1" fill="none" />
          <rect x="150" y={42 + i * 22} width="82" height="19" rx="4" stroke="var(--emerald)" strokeWidth="1.1" fill="var(--mint)" fillOpacity=".3" />
          <text x="157" y={55 + i * 22} className={MONO} fontSize="6" fill="var(--forest)">
            {k.label}
          </text>
        </g>
      ))}
      {/* exits start flush at x=128 — the funnel's right edge — not at
          132: a 4px float here is the same disconnected-line problem the
          main diagram had. */}
      <path d="M128 52 L146 52 M128 74 L146 74" stroke="var(--emerald)" strokeWidth="1" fill="none" />
      <path d="M142 49 L146 52 L142 55 M142 71 L146 74 L142 77" stroke="var(--emerald)" strokeWidth="1" fill="none" />
      <circle cx="140" cy="63" r="2.4" fill="var(--emerald)" className="pulse" />
      <text x="191" y="34" textAnchor="middle" className={MONO} fontSize="5.5" letterSpacing=".1em" fill="var(--emerald)" opacity=".8">
        STORED
      </text>

      {/* dropped */}
      <text x="191" y="100" textAnchor="middle" className={MONO} fontSize="5.5" letterSpacing=".1em" fill="var(--forest)" opacity=".35">
        DROPPED
      </text>
      {["morning!", "haha nice"].map((t, i) => (
        <g key={t} opacity=".32">
          <text x="157" y={113 + i * 12} className={MONO} fontSize="6" fill="var(--forest)">
            {t}
          </text>
          <line x1="156" y1={110.6 + i * 12} x2={156 + w(t.length, 6)} y2={110.6 + i * 12} stroke="var(--forest)" strokeWidth=".8" />
        </g>
      ))}
    </svg>
  );
}

/* ── 04 · swarm sync ───────────────────────────────────────
   Named clients, not A/B/C: one writes, the others see it without a
   hand-off. */
function SwarmArt() {
  /* Layout is derived, not eyeballed. Two collisions in the previous
     version came from guessing: the WRITES label's cap top (y=20.1)
     crossed the header pill's bottom edge (y=21), and the outer ring
     (bottom y=116 at r=40) ran straight through the STORE caption at
     y=103. Everything below is spaced off those two numbers:
       pill      y 4..19
       rings     cy 78, r≤38  ->  y 40..116   (clear of pill)
       caption   y 130 baseline -> cap top 126 (clear of rings) */
  const CY = 78;
  const readers = [
    { label: "cursor", y: 38 },
    { label: "opencode", y: 102 },
  ];
  return (
    <svg viewBox="0 0 240 140" className="w-full" aria-hidden="true">
      <rect x="58" y="4" width="124" height="15" rx="7.5" fill="var(--forest)" />
      <text x="120" y="14.5" textAnchor="middle" className={MONO} fontSize="6" letterSpacing=".04em" fill="var(--paper)">
        one write · everyone sees it
      </text>

      {[22, 30, 38].map((r, i) => (
        <circle key={r} cx="120" cy={CY} r={r} stroke="var(--emerald)" strokeWidth="1" fill="none" opacity={0.28 - i * 0.07} />
      ))}

      {/* store */}
      <rect x="102" y={CY - 17} width="36" height="34" rx="6" stroke="var(--forest)" strokeWidth="1.2" fill="var(--mint)" fillOpacity=".45" />
      <circle cx="120" cy={CY} r="3.2" fill="var(--emerald)" className="pulse" />

      {/* writer — solid emerald edge marks the one that wrote */}
      <rect x="6" y="52" width="54" height="17" rx="4" stroke="var(--emerald)" strokeWidth="1.15" fill="var(--paper)" />
      <text x="33" y="63.5" textAnchor="middle" className={MONO} fontSize="6" fill="var(--forest)">
        claude code
      </text>
      <text x="6" y="46" className={MONO} fontSize="5.5" letterSpacing=".1em" fill="var(--emerald)">
        WRITES
      </text>
      <path d="M62 60.5 L98 71" stroke="var(--emerald)" strokeWidth="1.2" fill="none" />
      <path d="M93 68.4 L98 71 L92.8 73.4" stroke="var(--emerald)" strokeWidth="1.2" fill="none" />

      {/* readers — mint edges, arrows leaving the store */}
      {readers.map((r) => {
        const cy = r.y + 8.5;
        return (
          <g key={r.label}>
            <path d={`M142 ${CY + (cy < CY ? -6 : 6)} L178 ${cy}`} stroke="var(--mint)" strokeWidth="1.2" fill="none" />
            <path
              d={`M173 ${cy - 3} L178 ${cy} L173 ${cy + 3}`}
              stroke="var(--mint)"
              strokeWidth="1.2"
              fill="none"
            />
            <rect x="180" y={r.y} width="54" height="17" rx="4" {...S} fill="var(--paper)" />
            <text x="207" y={r.y + 11.5} textAnchor="middle" className={MONO} fontSize="6" fill="var(--forest)">
              {r.label}
            </text>
          </g>
        );
      })}

      <text x="120" y="130" textAnchor="middle" className={MONO} fontSize="5.5" letterSpacing=".1em" fill="var(--forest)" opacity=".5">
        NO HAND-OFF · SEEN ON NEXT RUN
      </text>
    </svg>
  );
}

const PILLARS = [
  {
    n: "01",
    title: "Captures in the background",
    body: "Conversation logs hit a queue instantly — zero added latency. A worker extracts the durable facts while your agent keeps answering.",
    Art: CaptureArt,
  },
  {
    n: "02",
    title: "Replaces stale facts, cleanly",
    body: "Change a decision and the old fact is marked invalid, not merely outranked. Later searches return only what still holds.",
    Art: ReplaceArt,
  },
  {
    n: "03",
    title: "Filters out the small talk",
    body: "Greetings, jokes and thinking-out-loud never reach the store. Project rules, tech choices and preferences do.",
    Art: FilterArt,
  },
  {
    n: "04",
    title: "Shared across your swarm",
    body: "When several agents work the same problem, state updates broadcast in real time so none of them drift out of sync.",
    Art: SwarmArt,
  },
];

export default function PillarCards() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {PILLARS.map(({ n, title, body, Art }, i) => (
        /* Each card reveals on its own, staggered by index, so the four
           arrive in reading order rather than as one slab.

           `h-full` on BOTH the wrapper and the article: the wrapper is
           now the grid item, and grid stretches it — but the article
           inside would size to its own content, so a short card would
           no longer match a tall neighbour's height. */
        <Reveal key={n} delay={i * 90} className="h-full">
          <article
            className="hairline group flex h-full flex-col overflow-hidden rounded-xl border bg-paper transition-[border-color,box-shadow] duration-300 hover:border-emerald/35 hover:shadow-[0_16px_40px_-24px_rgba(20,52,43,0.28)]"
          >
          {/* stage — tighter padding than before so the art fills it */}
          <div className="relative border-b border-forest/8 bg-paper-dim/45 px-5 pb-5 pt-6">
            <span className="absolute right-4 top-3 font-mono text-[9px] tracking-[0.1em] text-forest/25">
              {n}
            </span>
            <div className="mx-auto max-w-[300px]">
              <Art />
            </div>
          </div>

            <div className="flex flex-1 flex-col px-6 pb-7 pt-5">
              <h3 className="text-[17.5px] font-medium leading-[1.3] tracking-[-0.015em] text-forest">
                {title}
              </h3>
              <p className="mt-2.5 text-[12.5px] leading-[1.75] text-forest/70">{body}</p>
            </div>
          </article>
        </Reveal>
      ))}
    </div>
  );
}
