import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

/* Root 404. Without this file Next served its stock page: a black
   screen reading "This page could not be found", no way back to the
   site, and the homepage's <title>. It renders inside the root layout
   only, not (legal)/layout.tsx, so it carries its own copy of that
   static header rather than SiteNav, which is built for the dark hero.

   No `robots` here: Next injects `noindex` on every 404 response. */
export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col bg-paper">
      <header className="hairline border-b bg-paper">
        <div className="mx-auto flex w-full max-w-[1240px] items-center px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo-black.png"
              alt=""
              width={28}
              height={28}
              aria-hidden="true"
              className="h-7 w-7 object-contain"
            />
            <span className="text-[16.5px] font-medium tracking-tight text-forest">
              brainfeather
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[900px] flex-1 flex-col justify-center px-6 py-24">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
          404
        </p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.1rem)] font-light leading-[1.08] tracking-[-0.03em] text-forest">
          This page doesn&apos;t exist.
        </h1>
        <p className="mt-5 max-w-[52ch] text-[15px] leading-[1.7] text-forest/70">
          The link may be old, or the address may have a typo. Everything that does exist is one
          step away.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full bg-forest px-5 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-paper transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald"
          >
            Back to home
          </Link>
          <Link
            href="/contact"
            className="hairline rounded-full border px-5 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-forest transition-colors hover:border-emerald/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald"
          >
            Contact us
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
