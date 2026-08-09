"use client";

import { useEffect, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────────
   Scroll-reveal primitives.

   THE RULE THIS IS BUILT AROUND: content must never depend on JS to
   become visible. Rendering `opacity: 0` on the server and clearing it
   on hydration means a JS failure, a slow chunk, or a crawler sees a
   blank page. So `shown` starts TRUE and every element is visible in
   the server HTML.

   After mount we then decide, per element, whether it's worth
   animating at all:

     · reduced-motion            → never animate, stay visible
     · already on screen at load → stay visible (no animate-in flash
                                   for above-the-fold content, which
                                   would just look like a slow load)
     · below the fold            → hide, observe, reveal on approach

   Hiding a below-fold element after mount is invisible to the user by
   definition: it's off screen when it happens.
   ──────────────────────────────────────────────────────────────── */

type Options = {
  /** Start revealing this far before the element's top edge. */
  margin?: string;
};

/**
 * Returns `shown` (drive your classes off this) and `armed` (true only
 * when this element will actually animate — useful for deciding
 * whether a counter should start from zero or just print its total).
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(opts: Options = {}) {
  const { margin = "0px 0px -12% 0px" } = opts;
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(true);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let io: IntersectionObserver | undefined;

    /* Deferred one frame so hydration settles against the server's
       fully-visible markup before anything is hidden. */
    const raf = requestAnimationFrame(() => {
      const box = el.getBoundingClientRect();

      /* Only arm what's below the fold. `>= innerHeight` rather than
         `> 0` on purpose: an element straddling the bottom edge is
         partly read already, and hiding it would be a visible jump. */
      if (box.top < window.innerHeight) return;

      setArmed(true);
      setShown(false);

      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setShown(true);
            io?.disconnect(); // reveal once; re-hiding on scroll-up is nauseating
          }
        },
        { threshold: 0, rootMargin: margin },
      );
      io.observe(el);
    });

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [margin]);

  return { ref, shown, armed };
}

/**
 * Counts from 0 to `target` once `run` flips true.
 *
 * Returns `target` verbatim when not armed, so the server HTML and any
 * reduced-motion client render the real figure rather than a zero.
 */
export function useCountUp(target: number, run: boolean, armed: boolean, ms = 1100) {
  const [n, setN] = useState(0);

  useEffect(() => {
    /* Nothing to animate: the two static cases are DERIVED below
       during render rather than pushed into state here. Calling
       setState synchronously in an effect to mirror a prop is the
       cascading-render pattern React warns about — and it's redundant
       when the value is a pure function of the props. */
    if (!armed || !run) return;

    let raf = 0;
    let start: number | null = null;

    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min((t - start) / ms, 1);
      /* easeOutCubic — fast then settling, so the last digits land
         gently instead of snapping. */
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    /* Safety net. requestAnimationFrame is throttled — sometimes to a
       standstill — in background tabs, low-power modes, and headless
       browsers, and CSS transitions keep running when it stalls. Without
       this, a stalled rAF would leave the figure reading 0 permanently
       while the bar beside it sat at full width.

       setTimeout is throttled too, but it still FIRES (clamped to ~1s in
       background tabs) rather than stopping, so the number is guaranteed
       to reach its target. The +120ms means this loses the race to a
       healthy rAF and only takes over when that has genuinely stalled. */
    const failsafe = window.setTimeout(() => setN(target), ms + 120);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
    };
  }, [target, run, armed, ms]);

  /* Not armed — server HTML, no-JS, and reduced-motion all land here,
     so they print the real figure instead of a zero that never ticks. */
  if (!armed) return target;
  /* Armed but not yet revealed: below the fold, so nobody sees the 0. */
  if (!run) return 0;
  return n;
}

type RevealProps = {
  children: React.ReactNode;
  /** `up` also slides; `fade` and `scale` are quieter. */
  variant?: "up" | "fade" | "scale";
  /** ms — stagger siblings by passing i * 80 or so. */
  delay?: number;
  className?: string;
};

const HIDDEN: Record<string, string> = {
  up: "translate-y-[22px] opacity-0",
  fade: "opacity-0",
  scale: "scale-[0.97] opacity-0",
};

/** Wraps a block so it animates in as it comes into view. */
export default function Reveal({
  children,
  variant = "up",
  delay = 0,
  className = "",
}: RevealProps) {
  const { ref, shown } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      style={shown && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`motion-safe:transition-[opacity,transform] motion-safe:duration-[750ms] motion-safe:ease-[cubic-bezier(0.22,0.7,0.28,1)] ${
        shown ? "translate-y-0 scale-100 opacity-100" : HIDDEN[variant]
      } ${className}`}
    >
      {children}
    </div>
  );
}
