"use client";

/* ────────────────────────────────────────────────────────────────
   /settings — API keys and editor setup.

   A key is shown in full only in the response to creating it. After a
   reload it renders masked. That is a UI convention here, not a security
   property: keys are still stored in plaintext, so the store is the
   thing to fix (hash on write, compare on read) before this is a real
   guarantee. Masking only limits shoulder-surfing and screenshots.
   ──────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { RequireAuth, useAuth } from "@/components/AuthProvider";
import { authService, apiKeyService } from "@/services/appwrite";
import type { ApiKey, User } from "@/types";

const FIELD =
  "hairline h-11 w-full rounded-full border bg-paper px-5 text-[14px] text-forest placeholder:text-forest/35 focus:border-emerald/50 focus:outline-none focus:ring-2 focus:ring-emerald/20";

const PILL =
  "hairline rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50";

function mcpConfig(token: string) {
  return JSON.stringify(
    {
      mcpServers: {
        brainfeather: {
          command: "npx",
          args: ["-y", "@brainfeather/mcp"],
          env: { BRAINFEATHER_API_KEY: token },
        },
      },
    },
    null,
    2,
  );
}

const mask = (key: string) => `${key.slice(0, 11)}…${key.slice(-4)}`;

/* Absolute dates for key activity: "3 days ago" goes stale the moment
   the page sits open, and a last-used timestamp is audit information —
   precision beats friendliness here. */
function usedLabel(lastUsedAt?: string): string {
  if (!lastUsedAt) return "never used";
  return `used ${new Date(lastUsedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function Settings() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    apiKeyService
      .list(user.$id)
      .then((res) => {
        if (active) setKeys(res.documents as unknown as ApiKey[]);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load keys.");
        }
      });

    /* Profile row: plan and account metadata. get-or-create, so an
       OAuth account without a row is backfilled here too. */
    authService
      .ensureProfile({ $id: user.$id, email: user.email ?? "", name: user.name })
      .then((doc) => {
        if (active) setProfile(doc as unknown as User);
      })
      .catch(() => {
        /* A missing profile degrades the account card only. */
      });

    return () => {
      active = false;
    };
  }, [user]);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const doc = (await apiKeyService.create(
        user.$id,
        name.trim(),
      )) as unknown as ApiKey;
      setKeys((prev) => [doc, ...(prev ?? [])]);
      setRevealed((prev) => ({ ...prev, [doc.$id]: doc.key }));
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create key.");
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Any editor using it loses access.")) return;
    try {
      await apiKeyService.delete(id);
      setKeys((prev) => (prev ?? []).filter((k) => k.$id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke key.");
    }
  }

  async function copy(id: string, token: string) {
    await navigator.clipboard.writeText(mcpConfig(token));
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <AppShell title="Settings" intro="Account, keys and editor setup.">
      <section className="hairline mb-11 rounded-xl border bg-paper p-4 sm:p-5">
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

      <section>
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-forest">
          API keys
        </h2>
        <p className="mt-1 text-[13px] text-forest/60">
          One key per editor makes it possible to revoke just one.
        </p>

        <form onSubmit={createKey} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <label htmlFor="key-name" className="sr-only">
            Key name
          </label>
          <input
            id="key-name"
            name="key-name"
            type="text"
            required
            placeholder="Claude Code"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD}
          />
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="h-11 shrink-0 rounded-full bg-forest px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-paper transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            {pending ? "Generating…" : "Generate key"}
          </button>
        </form>

        <p aria-live="polite" className="mt-2 min-h-[1.1rem] text-[12px] text-red-700">
          {error ?? "\u00A0"}
        </p>

        {keys === null ? (
          <output
            aria-live="polite"
            className="block font-mono text-[11px] uppercase tracking-[0.1em] text-forest/45"
          >
            Loading…
          </output>
        ) : keys.length === 0 ? (
          <p className="hairline rounded-xl border bg-paper p-6 text-center text-[13px] text-forest/55">
            No keys yet. Generate one to connect an editor.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {keys.map((key) => {
              const full = revealed[key.$id];
              return (
                <li
                  key={key.$id}
                  className="hairline flex flex-wrap items-center gap-3 rounded-xl border bg-paper p-4"
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-forest">
                      {key.name}
                    </div>
                    <code className="font-mono text-[11px] text-forest/50">
                      {full ?? mask(key.key)}
                    </code>
                    {full ? (
                      <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.1em] text-emerald">
                        shown once
                      </span>
                    ) : null}
                    <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.08em] text-forest/35">
                      {usedLabel(key.lastUsedAt)}
                    </span>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => copy(key.$id, key.key)}
                      className={`${PILL} text-forest/60 hover:border-emerald/40 hover:text-forest`}
                    >
                      {copied === key.$id ? "Copied" : "Copy config"}
                    </button>
                    <button
                      type="button"
                      onClick={() => revoke(key.$id)}
                      className={`${PILL} text-forest/50 hover:border-red-400 hover:text-red-700`}
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rule-t mt-11 pt-9">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-forest">
          Connect an editor
        </h2>
        <p className="mt-1 text-[13px] text-forest/60">
          Paste into <code className="font-mono text-[12px]">~/.claude/settings.json</code>,
          or your client&apos;s MCP config.
        </p>
        <pre className="hairline mt-4 overflow-x-auto rounded-xl border bg-paper-dim p-4 font-mono text-[12px] leading-relaxed text-forest/75">
          <code>{mcpConfig("bf_live_…")}</code>
        </pre>
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
