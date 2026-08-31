"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { RequireAuth } from "@/components/AuthProvider";
import { useApiSession, type ApiKeyRow } from "@/lib/api-client";

const FIELD =
  "hairline h-11 w-full rounded-lg border bg-paper px-4 text-[14px] text-forest placeholder:text-forest/35 focus:border-emerald/50 focus:outline-none focus:ring-2 focus:ring-emerald/20";

const ACTION =
  "hairline rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50";

function mcpConfig(token: string) {
  return JSON.stringify(
    {
      mcpServers: {
        brainfeather: {
          command: "npx",
          args: ["-y", "@brainfeather/mcp@1.6.1"],
          env: { BRAINFEATHER_API_KEY: token },
        },
      },
    },
    null,
    2,
  );
}

function usedLabel(lastUsedAt?: string): string {
  if (!lastUsedAt) return "never used";
  return `used ${new Date(lastUsedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function ApiKeysView() {
  const { token, error: sessionError, request } = useApiSession();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    request<{ keys: ApiKeyRow[] }>("/keys")
      .then((response) => {
        if (active) setKeys(response.keys);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load API keys.");
      });
    return () => {
      active = false;
    };
  }, [token, request]);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const created = await request<{ key: ApiKeyRow; token: string }>("/keys", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setKeys((previous) => [created.key, ...(previous ?? [])]);
      setRevealed((previous) => ({ ...previous, [created.key.$id]: created.token }));
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create API key.");
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Any client using it loses access.")) return;
    try {
      await request(`/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      setKeys((previous) => (previous ?? []).filter((key) => key.$id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke API key.");
    }
  }

  async function copy(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <AppShell
      title="API Keys"
      intro="Create a secure key for your coding agent. Each key can be revoked independently."
      wide
    >
      <section className="hairline rounded-xl border bg-paper p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="max-w-2xl flex-1">
            <h2 className="text-[16px] font-semibold text-forest">Create a key</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-forest/45">
              The secret is shown once. Store it safely; Brainfeather keeps only its digest.
            </p>
          </div>
          <form onSubmit={createKey} className="flex w-full gap-2 lg:max-w-lg">
            <input
              required
              maxLength={128}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Key name, e.g. Claude Code"
              aria-label="API key name"
              className={FIELD}
            />
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="h-11 shrink-0 rounded-lg bg-emerald px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-forest-deep disabled:opacity-50"
            >
              {pending ? "Generating" : "Generate"}
            </button>
          </form>
        </div>
        <p aria-live="polite" className="mt-3 min-h-5 text-[12px] text-red-300">
          {error ?? sessionError ?? "\u00A0"}
        </p>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-forest">Active keys</h2>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/35">
            {keys?.length ?? 0} / 25
          </span>
        </div>
        {keys === null ? (
          <output className="font-mono text-[10px] uppercase tracking-[0.1em] text-forest/40">
            Loading…
          </output>
        ) : keys.length === 0 ? (
          <div className="hairline rounded-xl border border-dashed bg-paper p-8 text-center text-[13px] text-forest/45">
            No API keys yet.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-paper">
            {keys.map((key) => {
              const secret = revealed[key.$id];
              return (
                <li
                  key={key.$id}
                  className="flex flex-col gap-3 border-b border-white/[0.07] p-4 last:border-b-0 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-forest/85">{key.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <code className="font-mono text-[10px] text-forest/45">
                        {secret ?? key.keyHint}
                      </code>
                      {secret ? (
                        <span className="rounded border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-amber-200">
                          shown once
                        </span>
                      ) : null}
                      <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-forest/25">
                        {usedLabel(key.lastUsedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {secret ? (
                      <>
                        <button
                          type="button"
                          onClick={() => copy(`${key.$id}:secret`, secret)}
                          className={`${ACTION} text-forest/55 hover:border-emerald/35 hover:text-forest`}
                        >
                          {copied === `${key.$id}:secret` ? "Copied" : "Copy secret"}
                        </button>
                        <button
                          type="button"
                          onClick={() => copy(`${key.$id}:config`, mcpConfig(secret))}
                          className={`${ACTION} text-forest/55 hover:border-emerald/35 hover:text-forest`}
                        >
                          {copied === `${key.$id}:config` ? "Copied" : "Copy MCP config"}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => revoke(key.$id)}
                      className={`${ACTION} text-forest/40 hover:border-red-400/40 hover:text-red-300`}
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

      <section className="hairline mt-9 rounded-xl border bg-paper p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-emerald/70">
              Recommended setup
            </p>
            <h2 className="mt-2 text-[16px] font-semibold text-forest">Connect your coding agent</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-forest/45">
              Generate a key, copy its MCP config, and add it to your client. Run the optional
              adapter installer once for automatic recall in Claude Code, Cursor, and OpenCode.
            </p>
          </div>
          <code className="shrink-0 rounded-lg border border-white/[0.08] bg-paper-dim px-4 py-3 font-mono text-[11px] text-forest/65">
            npx -y @brainfeather/mcp@1.6.1 init
          </code>
        </div>
      </section>
    </AppShell>
  );
}

export default function ApiKeysPage() {
  return (
    <RequireAuth>
      <ApiKeysView />
    </RequireAuth>
  );
}
