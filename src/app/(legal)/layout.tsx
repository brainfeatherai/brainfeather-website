import Image from "next/image";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

/* ────────────────────────────────────────────────────────────────
   Shared chrome for /privacy, /terms and /contact.

   A route group — `(legal)` in parens is organisational only and does
   NOT appear in the URL, so these render at /privacy, not /legal/privacy.
   It nests inside the root layout, which keeps <html>/<body>.

   Deliberately not SiteNav: that bar is built for the dark hero and
   is fixed-positioned with scroll state. Legal pages are cream from
   the top, so they get a simple static header instead.
   ──────────────────────────────────────────────────────────────── */

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-paper">
      <header className="hairline sticky top-0 z-40 border-b bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-6 py-4">
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

          <Link
            href="/"
            className="group flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-forest/60 transition-colors hover:text-forest"
          >
            <span
              className="transition-transform duration-300 group-hover:-translate-x-0.5"
              aria-hidden="true"
            >
              ←
            </span>
            Back to site
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}
