import type { Metadata } from "next";
import Image from "next/image";
import FlowDiagram from "@/components/FlowDiagram";
import ChatCompare from "@/components/ChatCompare";
import SiteNav from "@/components/SiteNav";
import PillarCards from "@/components/PillarCards";
import SiteFooter from "@/components/SiteFooter";
import WaitlistForm from "@/components/WaitlistForm";
import Reveal from "@/components/Reveal";
import StructuredData from "@/components/StructuredData";

/* Own canonical + og:url, rather than inheriting from the root layout:
   a root-level canonical is inherited by EVERY child, which made the
   legal routes all point here and read as duplicates. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

/* ── dotted glyph, the recurring marker motif ── */
function DotGlyph({ variant = "ring" }: { variant?: "ring" | "grid" | "fade" }) {
  const dots: { x: number; y: number; o: number }[] = [];

  if (variant === "ring") {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      dots.push({ x: 11 + Math.cos(a) * 9, y: 11 + Math.sin(a) * 9, o: 0.9 });
    }
  } else if (variant === "grid") {
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++)
        dots.push({ x: 3 + c * 4, y: 3 + r * 4, o: 0.35 + (c / 5) * 0.65 });
  } else {
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++)
        dots.push({ x: 3 + c * 4, y: 3 + r * 4, o: 1 - (r / 5) * 0.8 });
  }

  return (
    <svg viewBox="0 0 22 22" className="h-[22px] w-[22px]" aria-hidden="true">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="0.85" fill="currentColor" opacity={d.o} />
      ))}
    </svg>
  );
}

function CornerTicks() {
  return (
    <>
      {["left-3 top-3", "right-3 top-3", "left-3 bottom-3", "right-3 bottom-3"].map((pos) => (
        <span key={pos} className={`pointer-events-none absolute ${pos} text-emerald/40`} aria-hidden="true">
          <DotGlyph variant="grid" />
        </span>
      ))}
    </>
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-forest-deep">
      <StructuredData />
      <SiteNav />

      {/* ══════════════ HERO ══════════════ */}
      <section
        id="top"
        className="hero-wash grain relative isolate min-h-[84vh] overflow-hidden pb-40"
      >
        {/* Background layers, bottom to top. All are transform/opacity
            only, and all are covered by prefers-reduced-motion. */}
        <div className="hero-bloom bloom-breathe" aria-hidden="true" />
        <div className="hero-bloom-alt bloom-wander" aria-hidden="true" />
        <div className="flute flute-shimmer" aria-hidden="true" />
        <div className="hero-sweep hero-sweep-run" aria-hidden="true" />

        {/* clears the fixed nav (≈84px at rest) */}
        <div className="relative z-10 mx-auto max-w-[1240px] px-6 pt-[8.5rem] md:pt-[10.5rem]">
          {/* `.rise` is pure CSS, not the JS <Reveal>: this is above the
              fold, so an IntersectionObserver would already be past it,
              and a scripted entrance would flash on a slow chunk. */}
          <p className="rise rise-1 mb-6 text-center font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-paper/70">
            Long-term memory for AI agents
          </p>
          <h1 className="rise rise-2 text-center text-[clamp(2.3rem,6.2vw,5.1rem)] font-light leading-[1.06] tracking-[-0.03em] text-paper">
            Your agent forgets
            <br />
            everything. We don&apos;t.
          </h1>
          <p className="rise rise-3 mx-auto mt-8 max-w-[34rem] text-center text-[15px] leading-[1.7] text-paper/85">
            Brainfeather is the memory layer that sits under Claude Code, Cursor and your
            own agents — recording the facts that matter and handing them back on the next
            run.
          </p>
        </div>

        <Image
          src="/feather.png"
          alt=""
          width={382}
          height={653}
          priority
          aria-hidden="true"
          className="feather-tint drift pointer-events-none absolute -right-12 bottom-[-5rem] z-0 h-[400px] w-auto opacity-35 md:right-10 md:h-[500px]"
        />
      </section>

      {/* ══════════════ CREAM SHEET ══════════════ */}
      <div className="relative z-20 mx-auto -mt-32 w-full max-w-[1240px] px-4 pb-24">
        <div className="relative bg-paper px-6 pb-28 pt-14 sm:px-12">
          <CornerTicks />

          <div className="mx-auto max-w-lg text-center">
            <p className="text-[15px] leading-relaxed text-forest/85">
              Every new session starts your assistant from zero. Brainfeather keeps the
              context that outlives the chat window.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {/* Waitlist, not /login. Access is invite-only while
                  testing, so sending an uninvited visitor to a sign-up
                  form would be sending most of them to a dead end.
                  Testers reach /login from the nav. Stays an anchor
                  because it scrolls within this page. */}
              <a
                href="#waitlist"
                className="flex items-center gap-2.5 rounded-full bg-forest py-2 pl-2 pr-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-paper transition-transform hover:scale-[1.03]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper/15 text-mint">
                  <DotGlyph variant="ring" />
                </span>
                Get early access
              </a>
              <a
                href="#how"
                className="hairline flex items-center gap-2.5 rounded-full border bg-paper-dim py-2 pl-2 pr-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-forest transition-colors hover:bg-mint/25"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest/8 text-emerald">
                  <DotGlyph variant="grid" />
                </span>
                See how it works
              </a>
            </div>
          </div>

          {/* ── RAM vs disk ── */}
          <div className="rule-t mt-20 pt-16">
            <Reveal className="grid gap-10 md:grid-cols-[210px_1fr]">
              <div className="flex items-start gap-3 text-emerald">
                <DotGlyph variant="grid" />
                <span className="pt-1 font-mono text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.1em] text-forest">
                  RAM
                  <br />
                  vs disk
                </span>
              </div>
              <p className="max-w-3xl text-[clamp(1.3rem,2.5vw,2rem)] font-light leading-[1.38] tracking-[-0.018em] text-forest">
                A context window is RAM — fast, and wiped when the session closes.
                Brainfeather is the disk beside it: what your project actually is, written
                as you work and read back before the next answer.
              </p>
            </Reveal>
          </div>

          {/* ── DIAGRAM ── */}
          <div id="how" className="rule-t rule-mark mt-24 pt-20">
            {/* the rule breaks around the mark — see .rule-mark */}
            <span
              className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
              aria-hidden="true"
            >
              <Image
                src="/feather.png"
                alt=""
                width={382}
                height={653}
                className="feather-tint h-8 w-auto opacity-50"
              />
            </span>
            <Reveal className="mx-auto max-w-xl text-center">
              <span className="hairline inline-block rounded-full border bg-paper-dim px-3.5 py-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-forest">
                One store, every client
              </span>
              <h2 className="mt-6 text-[clamp(1.9rem,4.6vw,3.4rem)] font-light leading-[1.06] tracking-[-0.03em] text-forest">
                Write once. Recall everywhere.
              </h2>
              <p className="mx-auto mt-5 max-w-md text-[13.5px] leading-[1.75] text-forest/75">
                Facts captured in one tool are available in all of them. Change a decision
                in Cursor and Claude Code knows about it on its next run.
              </p>
            </Reveal>

            {/* `scale` rather than `up`: the diagram is a wide isometric
                solid, and sliding it vertically fought the perspective. */}
            <Reveal variant="scale" delay={120} className="mt-10 overflow-hidden">
              <FlowDiagram />
            </Reveal>
          </div>

          {/* ── before / after prompt ── */}
          <div className="rule-t mt-24 pt-20">
            {/* Only the heading is wrapped — ChatCompare below runs its
                own replay choreography on a shared clock, and a second
                entrance transition on top of it would collide. */}
            <Reveal className="mx-auto max-w-xl text-center">
              <span className="hairline inline-block rounded-full border bg-paper-dim px-3.5 py-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-forest">
                In the prompt
              </span>
              <h2 className="mt-6 text-[clamp(1.9rem,4.6vw,3.4rem)] font-light leading-[1.06] tracking-[-0.03em] text-forest">
                What the model sees
              </h2>
              <p className="mx-auto mt-5 max-w-[38rem] text-[13.5px] leading-[1.75] text-forest/75">
                Same model, same question, same day&apos;s work — the only difference is
                whether it already knows your project. The Supabase stack below is just an
                example; Brainfeather records whichever one you chose.
              </p>
            </Reveal>

            <div className="mt-12">
              <ChatCompare />
            </div>

          </div>

          {/* ── pillars ──
              This section used to omit its rule: the scoreboard card
              that sat directly above ended in its own bottom border, so
              a rule here would have drawn a second edge a few px below
              it. That card is gone, the block above now ends in text,
              and the omission has no reason left — so it matches the
              other sections again. */}
          <div className="rule-t mt-24 pt-20">
            <Reveal className="mx-auto max-w-xl text-center">
              <h2 className="text-[clamp(1.9rem,4.6vw,3.4rem)] font-light leading-[1.06] tracking-[-0.03em] text-forest">
                Built to stay correct
              </h2>
              <p className="mx-auto mt-5 max-w-md text-[13.5px] leading-[1.75] text-forest/75">
                Storing everything is easy. Storing only what still holds true is the hard
                part.
              </p>
            </Reveal>

            {/* Not wrapped: PillarCards staggers its four cards itself,
                so one wrapper here would reveal them as a single slab. */}
            <div className="mt-14">
              <PillarCards />
            </div>
          </div>

          {/* ── closing ──
              h2, not h3: this is a top-level section heading, sibling to
              the ones above it, and an h3 here broke the outline.

              The waitlist is the PUBLIC path and stays so while access is
              invite-only: sending an uninvited visitor to /login would be
              sending most of them to a form they cannot complete. Testers
              reach /login from the nav instead.

              The form now writes to the Appwrite `waitlist` collection.
              It previously posted to a Google Apps Script webhook gated
              on WAITLIST_WEBHOOK_URL, which was never set in production —
              so every address submitted here was silently dropped. */}
          <div id="waitlist" className="rule-t mt-24 pt-16 text-center">
            <Reveal>
              <h2 className="text-[clamp(1.6rem,3.6vw,2.6rem)] font-light leading-[1.14] tracking-[-0.025em] text-forest">
                Stop re-explaining your project.
              </h2>
              <p className="mx-auto mt-4 max-w-sm text-[13.5px] leading-[1.7] text-forest/70">
                Brainfeather is in early development and onboarding testers. Leave your
                email and we&apos;ll send you an invite.
              </p>

              <WaitlistForm />
            </Reveal>
          </div>
        </div>

      </div>

      {/* Footer lives OUTSIDE the cream-sheet wrapper: SiteFooter
          carries its own max-width container, and nesting the two
          would double the horizontal padding. */}
      <SiteFooter />
    </div>
  );
}
