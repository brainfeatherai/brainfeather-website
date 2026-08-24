"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

/* ────────────────────────────────────────────────────────────────
   Persistent top nav.

   FIXED sibling of the hero, not a child: the hero sets
   `overflow-hidden` to clip the feather and the fluted ribs, and an
   overflow ancestor confines a sticky child to its own box — the bar
   would scroll away with the hero.

   At rest it's a bare full-bleed row over the gradient. On scroll it
   contracts into a floating pill inset from both edges, so the chrome
   reads as an object above the page rather than a band welded to it.
   ──────────────────────────────────────────────────────────────── */

/** The dotted-ring motif, matching the big waitlist CTA. */
function DotRing({ className = "" }: { className?: string }) {
  const dots = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return { x: 11 + Math.cos(a) * 7.4, y: 11 + Math.sin(a) * 7.4 };
  });
  return (
    <svg viewBox="0 0 22 22" className={className} aria-hidden="true">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="1.05" fill="currentColor" />
      ))}
    </svg>
  );
}

/* `Docs` used to sit here pointing at #waitlist — a label promising
   something that doesn't exist, resolving somewhere unrelated. Until
   there are docs, Contact is a link that keeps its word. */
const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Integrations", href: "/#how" },
  { label: "Contact", href: "/contact" },
];

export default function SiteNav() {
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 28);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 z-50 transition-[inset,padding] duration-500 ease-out ${
        lifted ? "inset-x-3 pt-3 sm:inset-x-6 lg:inset-x-10" : "inset-x-0 pt-0"
      }`}
    >
      <nav
        aria-label="Main"
        className={`mx-auto flex w-full max-w-[1180px] items-center justify-between transition-[background-color,backdrop-filter,border-color,border-radius,box-shadow,padding] duration-500 ease-out ${
          lifted
            ? "rounded-full border border-paper/12 bg-forest-deep/80 py-2.5 pl-5 pr-2.5 shadow-[0_10px_34px_-14px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150"
            : "rounded-none border border-transparent px-6 py-6"
        }`}
      >
        <Link href="/#top" className="flex items-center gap-2.5">
          <Image
            src="/logo-white.png"
            alt="Brainfeather"
            width={36}
            height={36}
            priority
            className={`object-contain transition-[height,width] duration-500 ${
              lifted ? "h-7 w-7" : "h-9 w-9"
            }`}
          />
          <span className="text-[18.5px] font-medium tracking-tight text-paper">brainfeather</span>
        </Link>

        <div className={`flex items-center transition-[gap] duration-500 ${lifted ? "gap-6" : "gap-8"}`}>
          <ul className="hidden items-center gap-7 text-[13.5px] text-paper/85 md:flex">
            {LINKS.map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  className="relative py-1 transition-opacity after:absolute after:inset-x-0 after:-bottom-0.5 after:h-[1px] after:origin-left after:scale-x-0 after:bg-mint/70 after:transition-transform after:duration-200 hover:opacity-70 hover:after:scale-x-100"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Straight to /login, not the old /#waitlist anchor. Signup
              exists, so scrolling someone to an email form was a longer
              path to a worse outcome. */}
          <Link
            href="/login"
            className="group flex shrink-0 items-center gap-2.5 rounded-full bg-paper py-1.5 pl-1.5 pr-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-forest transition-transform hover:scale-[1.03]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-forest text-mint">
              <DotRing className="h-[15px] w-[15px] transition-transform duration-500 group-hover:rotate-45" />
            </span>
            Sign in
          </Link>
        </div>
      </nav>
    </header>
  );
}
