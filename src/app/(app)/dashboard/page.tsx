"use client";

/* ────────────────────────────────────────────────────────────────
   /dashboard — the facts currently held about you.

   Reads through memoryService.listActive, not .list: the MCP server
   retracts a fact by flipping status to 'invalid' rather than deleting
   it, so an unfiltered read would show a superseded decision beside the
   one that replaced it — the exact failure the landing page promises
   does not happen.
   ──────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { RequireAuth, useAuth } from "@/components/AuthProvider";
import { memoryService } from "@/services/appwrite";
import type { Memory } from "@/types";

const COMMAND = "npx -y @brainfeather/mcp";

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="hairline rounded-xl border bg-paper p-4">
      <div className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-forest">
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
        {label}
      </div>
    </div>
  );
}

function MemoryRow({ memory }: { memory: Memory }) {
  const when = new Date(memory.$createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <li className="hairline rounded-xl border bg-paper p-4 transition-[border-color] duration-300 hover:border-emerald/35">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-mint/25 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-forest">
          {memory.category}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-forest/40">
          {memory.source}
        </span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-forest/35">
          {when}
        </span>
      </div>
      <p className="mt-2.5 text-[14px] leading-relaxed text-forest/85">
        {memory.content}
      </p>
    </li>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    memoryService
      .listActive(user.$id)
      .then((res) => {
        if (!active) return;
        setMemories(res.documents as unknown as Memory[]);
      })
      .catch((err: unknown) => {
        if (!active) return;
        // A missing collection is the likeliest cause on a fresh project,
        // and is worth distinguishing from "you have no memories yet".
        setError(err instanceof Error ? err.message : "Could not load memories.");
      });

    return () => {
      active = false;
    };
  }, [user]);

  const byCategory = (memories ?? []).reduce<Record<string, number>>(
    (acc, m) => {
      acc[m.category] = (acc[m.category] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <AppShell
      title="Memories"
      intro="What Brainfeather currently holds about your work. Retracted facts are hidden."
    >
      {error ? (
        <p
          role="alert"
          className="hairline rounded-xl border border-red-300 bg-red-50 p-4 text-[13px] text-red-800"
        >
          {error}
        </p>
      ) : memories === null ? (
        <output
          aria-live="polite"
          className="block font-mono text-[11px] uppercase tracking-[0.1em] text-forest/45"
        >
          Loading…
        </output>
      ) : memories.length === 0 ? (
        <div className="hairline rounded-xl border bg-paper p-9 text-center">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-forest">
            Nothing recorded yet
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-[14px] text-forest/60">
            Connect the MCP server in your editor and work normally. Durable
            facts arrive here on their own.
          </p>
          <code className="hairline mt-5 inline-block rounded-full border bg-paper-dim px-4 py-2 font-mono text-[12px] text-forest/75">
            {COMMAND}
          </code>
        </div>
      ) : (
        <>
          <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={memories.length} label="Active facts" />
            {Object.entries(byCategory)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([category, count]) => (
                <Stat key={category} value={count} label={category} />
              ))}
          </div>

          <ul className="flex flex-col gap-2.5">
            {memories.map((memory) => (
              <MemoryRow key={memory.$id} memory={memory} />
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
