"use client";

/* /settings — account details only. API keys live at /api-keys. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { RequireAuth, useAuth } from "@/components/AuthProvider";
import type { User } from "@/types";

function Settings() {
  const { user, jwt, refreshJwt, logout, deleteAccount } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const credential = jwt ?? (await refreshJwt());
      if (!credential) throw new Error("Dashboard authentication is unavailable.");
      const response = await fetch("/api/v1/account", {
        headers: { Authorization: `Bearer ${credential}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load account settings.");
      const body = (await response.json()) as { profile: User | null };
      if (active) setProfile(body.profile);
    })()
      .catch(() => {
        if (active) setProfile(null);
      });

    return () => {
      active = false;
    };
  }, [user, jwt, refreshJwt]);

  async function signOut() {
    await logout();
    router.replace("/");
  }

  async function removeAccount() {
    if (confirmDelete !== "DELETE" || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete your account.");
      setDeleting(false);
    }
  }

  return (
    <AppShell title="Settings" intro="Account and workspace preferences." wide>
      <section className="hairline rounded-xl border bg-paper p-5">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-forest">
          Account
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2.5 text-[13px] sm:grid-cols-2">
          <div className="flex justify-between gap-3 sm:block">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
              Email
            </dt>
            <dd className="truncate text-forest/85">{user?.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
              Name
            </dt>
            <dd className="truncate text-forest/85">{user?.name || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
              Plan
            </dt>
            <dd className="text-forest/85">{profile?.plan ?? "free"}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
              User id
            </dt>
            <dd className="truncate font-mono text-[11px] text-forest/60">
              {user?.$id ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="hairline mt-7 flex flex-col gap-4 rounded-xl border bg-paper p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-forest">Developer access</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-forest/45">
            API credentials and MCP client configuration are managed on their own page.
          </p>
        </div>
        <Link
          href="/api-keys"
          className="rounded-lg border border-white/[0.10] bg-white/[0.035] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-forest/60 transition-colors hover:border-white/[0.18] hover:text-forest"
        >
          Manage API keys
        </Link>
      </section>

      <section className="hairline mt-7 flex flex-col gap-4 rounded-xl border bg-paper p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-forest">Session</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-forest/45">
            Sign out of this browser. Your memories and API keys stay active.
          </p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="rounded-lg border border-white/[0.10] bg-white/[0.035] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-forest/55 transition-colors hover:border-white/[0.18] hover:text-forest"
        >
          Sign out
        </button>
      </section>

      <section className="mt-7 rounded-xl border border-red-500/25 bg-red-500/[0.045] p-5">
        <h2 className="text-[15px] font-semibold text-red-300">Danger zone</h2>
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-red-100/45">
          Permanently delete your account, memories, graph, API keys, request history,
          team data you own, and waitlist record. This cannot be undone.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="delete-confirmation">
            Type DELETE to confirm
          </label>
          <input
            id="delete-confirmation"
            value={confirmDelete}
            onChange={(event) => setConfirmDelete(event.target.value)}
            placeholder="Type DELETE to confirm"
            autoComplete="off"
            className="h-10 w-full max-w-xs rounded-lg border border-red-500/20 bg-black/15 px-3 text-[12px] text-red-100 outline-none placeholder:text-red-100/25 focus:border-red-400/45"
          />
          <button
            type="button"
            onClick={removeAccount}
            disabled={confirmDelete !== "DELETE" || deleting}
            className="h-10 rounded-lg border border-red-400/40 bg-red-500/15 px-4 font-mono text-[9px] uppercase tracking-[0.1em] text-red-200 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {deleting ? "Deleting…" : "Delete account"}
          </button>
        </div>
        <p aria-live="polite" className="mt-3 min-h-5 text-[11px] text-red-300/80">
          {error ?? "\u00A0"}
        </p>
      </section>
    </AppShell>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  );
}
