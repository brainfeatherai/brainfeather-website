"use client";

/* ────────────────────────────────────────────────────────────────
   AppShell — chrome shared by /dashboard and /settings.

   A plain header rather than reusing SiteNav: SiteNav is built for the
   marketing page (scroll-contracting pill, anchor links into sections)
   and none of that behaviour makes sense on a data page.

   Kept in one component so the two pages cannot drift apart.
   ──────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";

const TABS = [
  { href: "/dashboard", label: "Memories" },
  { href: "/settings", label: "Settings" },
] as const;

export default function AppShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  return (
    <>
      <header className="hairline sticky top-0 z-40 border-b bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-5">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-[-0.02em] text-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald/50"
          >
            brainfeather
          </Link>

          <nav aria-label="Dashboard" className="flex items-center gap-1">
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50 ${
                    active
                      ? "bg-forest text-paper"
                      : "text-forest/55 hover:bg-forest/5 hover:text-forest"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-forest/45 sm:inline">
                {user.email}
              </span>
            ) : null}
            <button
              type="button"
              onClick={signOut}
              className="hairline rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-forest/60 transition-colors hover:border-emerald/40 hover:text-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <div className="mb-9">
          <h1 className="text-[27px] font-semibold tracking-[-0.03em] text-forest">
            {title}
          </h1>
          <p className="mt-1.5 text-[14px] text-forest/60">{intro}</p>
        </div>
        {children}
      </main>
    </>
  );
}
