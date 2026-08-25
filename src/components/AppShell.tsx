"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Brain,
  Gauge,
  ChevronDown,
  CircleDot,
  ExternalLink,
  KeyRound,
  LogOut,
  Network,
  Search,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "./AuthProvider";

type NavItem = { href: string; label: string; icon: LucideIcon };

const KNOWLEDGE_NAV: readonly NavItem[] = [
  { href: "/overview", label: "Overview", icon: Gauge },
  { href: "/dashboard", label: "Memories", icon: Brain },
  { href: "/nodes", label: "Memory graph", icon: CircleDot },
  { href: "/graph", label: "Graph editor", icon: Network },
  { href: "/requests", label: "Requests", icon: Activity },
];

const SYSTEM_NAV: readonly NavItem[] = [
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

const DEVELOPER_NAV: readonly NavItem[] = [
  { href: "/api-keys", label: "API keys", icon: KeyRound },
];

function Brand() {
  return (
    <Link
      href="/overview"
      className="flex items-center gap-2.5 text-[16px] font-semibold tracking-[-0.03em] text-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald/50"
    >
      <Image
        src="/logo-white.png"
        alt="Brainfeather"
        width={32}
        height={32}
        priority
        className="h-8 w-8 object-contain"
      />
      <span>brainfeather</span>
    </Link>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  query,
}: {
  label: string;
  items: readonly NavItem[];
  pathname: string;
  query: string;
}) {
  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );
  if (filtered.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="px-3 font-mono text-[9px] uppercase tracking-[0.16em] text-forest/25">
        {label}
      </p>
      <div className="mt-2 flex flex-col gap-1">
        {filtered.map(({ href, label: itemLabel, icon: Icon }) => {
          const active = !href.includes("#") && pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50 ${
                active
                  ? "bg-white/[0.10] text-forest shadow-[inset_0_0_0_1px_rgba(255,255,255,0.045)]"
                  : "text-forest/52 hover:bg-white/[0.055] hover:text-forest/90"
              }`}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2 : 1.6}
                className={active ? "text-emerald" : "text-forest/35 group-hover:text-forest/65"}
                aria-hidden
              />
              <span>{itemLabel}</span>
              {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald" /> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function AppShell({
  title,
  intro,
  children,
  wide = false,
  immersive = false,
}: {
  title: string;
  intro: string;
  children: ReactNode;
  wide?: boolean;
  immersive?: boolean;
}) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [navQuery, setNavQuery] = useState("");
  const navSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navSearchRef.current?.focus();
        navSearchRef.current?.select();
      }
      if (event.key === "Escape" && document.activeElement === navSearchRef.current) {
        setNavQuery("");
        navSearchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  const initial = (user?.name || user?.email || "B").trim().charAt(0).toUpperCase();
  const allNav = [...KNOWLEDGE_NAV, ...DEVELOPER_NAV, ...SYSTEM_NAV];

  return (
    <div className="workspace-theme min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[0.08] bg-[#171918] px-4 py-5 lg:flex">
        <div className="px-2"><Brand /></div>

        <label className="relative mt-7 block">
          <span className="sr-only">Filter navigation</span>
          <Search
            size={14}
            strokeWidth={1.6}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-forest/25"
            aria-hidden
          />
          <input
            ref={navSearchRef}
            type="search"
            value={navQuery}
            onChange={(event) => setNavQuery(event.target.value)}
            placeholder="Search…"
            className="h-10 w-full rounded-lg border border-white/[0.09] bg-black/10 pl-9 pr-12 text-[12px] text-forest outline-none placeholder:text-forest/30 focus:border-emerald/35 focus:bg-black/15"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-white/[0.08] bg-white/[0.035] px-1.5 py-0.5 font-mono text-[8px] text-forest/25">
            ⌘K
          </kbd>
        </label>

        <nav aria-label="Dashboard" className="min-h-0 flex-1 overflow-y-auto pb-5">
          <NavGroup label="Knowledge" items={KNOWLEDGE_NAV} pathname={pathname} query={navQuery} />
          <NavGroup label="Developer" items={DEVELOPER_NAV} pathname={pathname} query={navQuery} />
          <NavGroup label="System" items={SYSTEM_NAV} pathname={pathname} query={navQuery} />

        </nav>

        <div className="border-t border-white/[0.07] pt-4">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.08] text-[12px] font-semibold text-forest">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-forest/80">
                {user?.name || "Personal workspace"}
              </p>
              <p className="truncate text-[10px] text-forest/30">{user?.email ?? "Signed in"}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-md p-2 text-forest/30 transition-colors hover:bg-white/[0.05] hover:text-forest"
            >
              <LogOut size={14} strokeWidth={1.7} aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#171918]/95 backdrop-blur-xl lg:hidden">
        <div className="flex min-h-14 w-full items-center gap-4 px-4 py-2">
          <Brand />
          <nav aria-label="Dashboard" className="ml-auto flex items-center gap-1 overflow-x-auto">
            {allNav.map(({ href, label, icon: Icon }) => {
              const active = !href.includes("#") && pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  title={label}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
                    active ? "bg-white/[0.09] text-emerald" : "text-forest/40 hover:text-forest"
                  }`}
                >
                  <Icon size={16} aria-hidden />
                  <span className="sr-only">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <header className="sticky top-0 z-30 hidden h-14 items-center border-b border-white/[0.065] bg-[#090b0a]/90 px-7 backdrop-blur-xl lg:flex">
          <div className="flex items-center gap-2 text-[11px] text-forest/40">
            <Activity size={14} strokeWidth={1.6} aria-hidden />
            <span>Personal</span>
            <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-forest/40">
              Free
            </span>
            <ChevronDown size={12} aria-hidden />
            <span className="mx-2 h-4 w-px bg-white/[0.08]" />
            <span className="font-mono uppercase tracking-[0.12em] text-forest/55">{title}</span>
          </div>
          <div className="ml-auto flex items-center gap-5">
            <span className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-forest/35">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald shadow-[0_0_10px_rgba(98,213,165,0.8)]" />
              Synced
            </span>
            <Link
              href="/contact"
              className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45 hover:text-forest"
            >
              Support <ExternalLink size={10} aria-hidden />
            </Link>
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.06] text-[11px] font-semibold text-forest/70">
              {initial}
            </span>
          </div>
        </header>

        <main
          className={`workspace-grid mx-auto w-full flex-1 px-5 ${immersive ? "py-3" : "py-8"} ${
            immersive ? "max-w-none lg:px-5" : wide ? "max-w-[1600px] lg:px-8" : "max-w-6xl lg:px-8"
          }`}
        >
          {!immersive ? (
            <div className="mb-7">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald/65">
                Brainfeather workspace
              </p>
              <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-forest">
                {title}
              </h1>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-forest/45">
                {intro}
              </p>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
