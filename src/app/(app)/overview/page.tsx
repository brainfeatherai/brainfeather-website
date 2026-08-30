"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Brain, CircleDot, ClipboardCheck, KeyRound, Network, Timer } from "lucide-react";
import AppShell from "@/components/AppShell";
import { RequireAuth } from "@/components/AuthProvider";
import { useApiSession, type OverviewData } from "@/lib/api-client";

function Metric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Brain;
}) {
  return (
    <div className="hairline rounded-xl border bg-paper p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-forest/35">{label}</p>
          <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-forest">{value}</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-forest/50">
          <Icon size={16} strokeWidth={1.7} aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-[11px] text-forest/35">{hint}</p>
    </div>
  );
}

function OverviewView() {
  const { token, error: sessionError, request } = useApiSession();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    request<OverviewData>("/overview")
      .then((overview) => {
        if (!active) return;
        setError(null);
        setData(overview);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load overview.");
      });
    return () => {
      active = false;
    };
  }, [token, request]);

  return (
    <AppShell
      title="Overview"
      intro="Your memory workspace at a glance. Review what is active, approve suggestions, and manage connected agents."
      wide
    >
      {error ?? sessionError ? (
        <p className="mb-6 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-[13px] text-red-200">
          {error ?? sessionError}
        </p>
      ) : null}

      {!data && !(error ?? sessionError) ? (
        <output className="font-mono text-[10px] uppercase tracking-[0.1em] text-forest/40">
          Loading overview…
        </output>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Active memories" value={data.memories} hint="What recall can inject" icon={Brain} />
            <Metric
              label="Review queue"
              value={data.pendingCandidates}
              hint="Captured facts waiting for approval"
              icon={ClipboardCheck}
            />
            <Metric label="Graph nodes" value={data.entities} hint={`${data.edges} graph connections`} icon={CircleDot} />
            <Metric label="API keys" value={data.keys} hint="Revocable client credentials" icon={KeyRound} />
            <Metric
              label="API calls · 30d"
              value={data.analytics.configured ? data.analytics.totalCalls : "—"}
              hint={
                data.analytics.configured
                  ? `${data.analytics.successRate}% successful`
                  : "Telemetry not configured"
              }
              icon={Activity}
            />
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="hairline rounded-xl border bg-paper p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-forest">Request performance</h2>
                  <p className="mt-1 text-[11px] text-forest/40">API-key traffic during the last 30 days</p>
                </div>
                <Link
                  href="/requests"
                  className="rounded-md border border-white/[0.09] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-forest/50 hover:text-forest"
                >
                  View requests
                </Link>
              </div>
              {data.analytics.configured ? (
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-paper-dim p-4">
                    <Timer size={14} className="text-emerald/60" aria-hidden />
                    <p className="mt-3 text-[22px] font-semibold text-forest">
                      {data.analytics.averageDurationMs} ms
                    </p>
                    <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-forest/30">Average</p>
                  </div>
                  <div className="rounded-lg bg-paper-dim p-4">
                    <Network size={14} className="text-sky-300/60" aria-hidden />
                    <p className="mt-3 text-[22px] font-semibold text-forest">
                      {data.analytics.p95DurationMs} ms
                    </p>
                    <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-forest/30">P95</p>
                  </div>
                  <div className="rounded-lg bg-paper-dim p-4">
                    <Activity size={14} className="text-violet-300/60" aria-hidden />
                    <p className="mt-3 text-[22px] font-semibold text-forest">{data.analytics.failedCalls}</p>
                    <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-forest/30">Failed</p>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-dashed border-white/[0.10] bg-paper-dim p-6 text-[12px] leading-relaxed text-forest/45">
                  Request telemetry is ready. API-key calls will appear here as clients use the
                  deployed API.
                </div>
              )}
            </section>

            <section className="hairline rounded-xl border bg-paper p-5">
              <h2 className="text-[15px] font-semibold text-forest">Quick actions</h2>
              <div className="mt-4 grid gap-2">
                {[
                  ["Manage memories", "/dashboard"],
                  ["Review captured facts", "/review"],
                  ["Explore memory graph", "/nodes"],
                  ["Create API key", "/api-keys"],
                  ["Inspect requests", "/requests"],
                ].map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[12px] text-forest/60 transition-colors hover:border-white/[0.14] hover:text-forest"
                  >
                    {label}
                    <span className="text-forest/25">→</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

export default function OverviewPage() {
  return (
    <RequireAuth>
      <OverviewView />
    </RequireAuth>
  );
}
