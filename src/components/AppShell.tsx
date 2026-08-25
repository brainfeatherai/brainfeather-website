"use client";

/* ────────────────────────────────────────────────────────────────
   AppShell — sidebar chrome shared by /dashboard, /graph and
   /settings.

   Sidebar on desktop (lg+), top bar on smaller screens — same items,
   same order, one source of truth in NAV so the two cannot drift.

   Kept in one component so the pages cannot drift apart either.
   ──────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Brain, CircleDot, LogOut, Network, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "./AuthProvider";

const NAV = [
  { href: "/dashboard", label: "Memories", icon: Brain },
  { href: "/nodes", label: "Nodes", icon: CircleDot },
  { href: "/graph", label: "Graph", icon: Network },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

const NAV_LINK =
  "flex items-center gap-2.5 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50";

const SIGNOUT =
  "hairline rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-forest/60 transition-colors hover:border-emerald/40 hover:text-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50";

function Brand() {
  return (
    <Link
      href="/"
      className="text-[15px] font-semibold tracking-[-0.02em] text-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald/50"
    >
      brainfeather
    </Link>
  );
}

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

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hairline fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-paper px-5 py-6 lg:flex">
        <Brand />

        <nav aria-label="Dashboard" className="mt-9 flex flex-col gap-1.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50 ${
                  active
                    ? "bg-forest text-paper"
                    : "text-forest/55 hover:bg-forest/5 hover:text-forest"
                }`}
              >
                <Icon size={15} strokeWidth={1.8} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2.5">
          {user ? (
            <span
              title={user.email}
              className="max-w-full truncate font-mono text-[10px] uppercase tracking-[0.08em] text-forest/45"
            >
              {user.email}
            </span>
          ) : null}
          <button type="button" onClick={signOut} className={SIGNOUT}>
            <span className="inline-flex items-center gap-2">
              <LogOut size={13} strokeWidth={1.8} aria-hidden />
              Sign out
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile top bar — same NAV, horizontal */}
      <header className="hairline sticky top-0 z-40 border-b bg-paper/85 backdrop-blur-sm lg:hidden">
        <div className="flex h-14 w-full items-center gap-4 px-5">
          <Brand />
          <nav aria-label="Dashboard" className="flex items-center gap-1">
            {NAV.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`${NAV_LINK} ${
                    active
                      ? "bg-forest text-paper"
                      : "text-forest/55 hover:bg-forest/5 hover:text-forest"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={signOut}
            className={`${SIGNOUT} ml-auto shrink-0`}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex min-h-dvh flex-col lg:pl-60">
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
          <div className="mb-9">
            <h1 className="text-[27px] font-semibold tracking-[-0.03em] text-forest">
              {title}
            </h1>
            <p className="mt-1.5 text-[14px] text-forest/60">{intro}</p>
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
