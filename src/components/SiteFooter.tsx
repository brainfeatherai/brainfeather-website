import Image from "next/image";
import Link from "next/link";
import { SOCIALS } from "@/lib/site";
import PublicAccessLink from "./PublicAccessLink";

/* ────────────────────────────────────────────────────────────────
   Site footer, shared by the landing page and the legal pages.

   Self-contained: it carries its own max-width container and dark
   ground, so it can be dropped into any route without inheriting a
   wrapper. Sits on `forest-deep`, matching the body background.

   Constants live in `@/lib/site` rather than here: a client component
   importing one string out of this file would drag the whole footer,
   and `next/image` with it, into the client bundle.
   ──────────────────────────────────────────────────────────────── */

export function SocialLinks({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const cls =
    tone === "dark"
      ? "text-paper/50 hover:bg-paper/10 hover:text-paper focus-visible:outline-mint"
      : "text-forest/50 hover:bg-forest/8 hover:text-forest focus-visible:outline-emerald";

  return (
    <ul className="flex items-center gap-1">
      {SOCIALS.map((s) => (
        <li key={s.name}>
          <a
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Brainfeather on ${s.name}`}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${cls}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[15px] w-[15px]"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={s.d} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}

/* Anchors are absolute (`/#how`, not `#how`) so they resolve from the
   legal routes too, where those sections don't exist. */
const COLUMNS = [
  {
    head: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "Integrations", href: "/#integrations" },
    ],
  },
  {
    head: "Company",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-forest-deep">
      <div className="relative mx-auto w-full max-w-[1240px] px-6 pb-10 pt-14">

        <div className="relative grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/logo-white.png"
                alt=""
                width={26}
                height={26}
                aria-hidden="true"
                className="h-[26px] w-[26px] object-contain"
              />
              <span className="text-[17px] font-medium tracking-tight text-paper">
                brainfeather
              </span>
            </Link>
            <p className="mt-4 max-w-[26rem] text-[13px] leading-[1.75] text-paper/55">
              Long-term memory for AI agents. Facts recorded once, recalled by every client
              you use.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-mint/25 bg-mint/10 px-3 py-1.5">
              <span className="pulse h-1.5 w-1.5 rounded-full bg-mint" aria-hidden="true" />
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-mint">
                in early development
              </span>
            </span>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.head}>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-paper/40">
                {col.head}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[13px] text-paper/70 transition-colors hover:text-paper"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── the reclining feather ──────────────────────────────
            The closing gesture: one big feather lying down at the end
            of the page, the way a wordmark signs off a site.

            Rotation is a transform, so it contributes NOTHING to
            layout — this wrapper reserves the vertical band itself,
            and `overflow-hidden` crops the plume's width rather than
            letting a 600px-tall image push the copyright row down.

            Two nested elements on purpose: the outer one centres
            (translate), the inner one rotates (`.doze`). Putting both
            on one element would have Tailwind's translate utilities
            and the animation's keyframes fight over `transform`. */}
        <div
          className="pointer-events-none relative mt-14 h-[180px] overflow-hidden sm:h-[250px] lg:h-[310px]"
          aria-hidden="true"
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Image
              src="/feather.png"
              alt=""
              width={382}
              height={653}
              /* These size the IMAGE BOX, not the feather: the feather
                 sits diagonally inside a mostly-transparent PNG, so the
                 box is much larger than the bird. Measured by scanning
                 the opaque pixels, a 660px box lays out a ~407×182
                 visible feather — length ≈ 0.62·boxHeight, height ≈
                 0.45·length.

                 660 is also about the ceiling worth using: the feather
                 is only ~411px long in the source, so a bigger box
                 upscales and softens it. The band heights above are
                 derived from the 0.62·0.45 products, plus room for the
                 fade — sizing the band to the BOX left 220px of dead
                 space beneath the feather. */
              className="feather-tint feather-sleep doze h-[390px] w-auto max-w-none opacity-40 sm:h-[530px] lg:h-[660px]"
            />
          </div>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-paper/10 pt-5">
          <span className="font-mono text-[10px] tracking-[0.06em] text-paper/40">
            © 2026 Brainfeather
          </span>

          {/* Between the copyright and the CTA: outbound links
              shouldn't compete with the one conversion point. */}
          <SocialLinks />

          {/* Public visitors request access; approved signed-in visitors
              see the console link through PublicAccessLink. */}
          <PublicAccessLink
            className="group flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-mint/80 transition-colors hover:text-mint"
          >
            Request access
            <span
              className="transition-transform duration-300 group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              →
            </span>
          </PublicAccessLink>
        </div>
      </div>
    </footer>
  );
}
