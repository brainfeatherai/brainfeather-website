"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { RequireAuth } from "@/components/AuthProvider";
import { useApiSession, type RequestAnalytics } from "@/lib/api-client";

const WINDOWS = [1, 7, 30, 90] as const;

function RequestsView() {
  const { token, error: sessionError, request } = useApiSession();
  const [days, setDays] = useState<number>(30);
  const [analytics, setAnalytics] = useState<RequestAnalytics | null>(null);
  const [operation, setOperation] = useState("all");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    request<RequestAnalytics>(`/analytics/requests?days=${days}`)
      .then((response) => {
        if (active) setAnalytics(response);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load requests.");
      });
    return () => {
      active = false;
    };
  }, [token, days, request]);

  const operations = analytics?.byOperation.map((item) => item.operation) ?? [];
  const rows = useMemo(
    () =>
      (analytics?.recent ?? []).filter((row) => {
        if (operation !== "all" && row.operation !== operation) return false;
        if (status === "success" && (row.status < 200 || row.status >= 400)) return false;
        if (status === "error" && row.status < 400) return false;
        return true;
      }),
    [analytics, operation, status],
  );

  return (
    <AppShell title="Requests" intro="API request history, response status, and latency." wide>
      {error ?? sessionError ? (
        <p className="mb-6 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-[13px] text-red-200">{error ?? sessionError}</p>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-paper p-1">
          {WINDOWS.map((windowDays) => (
            <button key={windowDays} type="button" onClick={() => setDays(windowDays)} className={`rounded-md px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] ${days === windowDays ? "bg-white/[0.10] text-forest" : "text-forest/35 hover:text-forest/65"}`}>
              {windowDays}d
            </button>
          ))}
        </div>
        <select value={operation} onChange={(event) => setOperation(event.target.value)} className="h-10 rounded-lg border border-white/[0.08] bg-paper px-3 text-[11px] text-forest/60 outline-none">
          <option value="all">All operations</option>
          {operations.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-white/[0.08] bg-paper px-3 text-[11px] text-forest/60 outline-none">
          <option value="all">All statuses</option>
          <option value="success">Successful</option>
          <option value="error">Errors</option>
        </select>
      </div>

      {!analytics ? (
        <output className="font-mono text-[10px] uppercase tracking-[0.1em] text-forest/40">Loading requests…</output>
      ) : !analytics.configured ? (
        <div className="hairline rounded-xl border border-dashed bg-paper p-10 text-center">
          <h2 className="text-[16px] font-semibold text-forest">Request telemetry is not configured</h2>
          <p className="mx-auto mt-2 max-w-lg text-[12px] leading-relaxed text-forest/45">The analytics UI is ready, but Brainfeather needs the additive request-metrics table before calls and latency can be recorded.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="hairline rounded-xl border bg-paper p-5">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/35">
                Calls by operation
              </p>
              <div className="mt-4 flex items-center gap-5">
                <div
                  className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(#62d5a5 0 ${analytics.successRate}%, rgba(255,255,255,0.07) ${analytics.successRate}% 100%)`,
                  }}
                >
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-paper">
                    <span className="text-[18px] font-semibold text-forest">{analytics.totalCalls}</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {analytics.byOperation.slice(0, 3).map((item, index) => (
                    <div key={item.operation} className="flex items-center gap-2 text-[10px] text-forest/45">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ background: ["#62d5a5", "#60a5fa", "#a78bfa"][index] }}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono">{item.operation}</span>
                      <span>{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="hairline rounded-xl border bg-paper p-5">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/35">
                Successful requests
              </p>
              <p className="mt-5 text-[30px] font-semibold tracking-[-0.04em] text-forest">
                {analytics.successfulCalls}
                <span className="ml-1 text-[13px] font-normal text-forest/30">
                  of {analytics.totalCalls}
                </span>
              </p>
              <div className="mt-5 h-1.5 overflow-hidden rounded-sm bg-white/[0.06]">
                <div className="h-full bg-emerald" style={{ width: `${analytics.successRate}%` }} />
              </div>
              <p className="mt-2 text-[10px] text-forest/35">{analytics.successRate}% success rate</p>
            </section>

            <section className="hairline rounded-xl border bg-paper p-5">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/35">
                Response latency
              </p>
              <p className="mt-5 text-[30px] font-semibold tracking-[-0.04em] text-forest">
                {analytics.averageDurationMs} ms
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[10px] text-forest/35">
                <span>P95</span>
                <span className="font-mono text-forest/55">{analytics.p95DurationMs} ms</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-forest/35">
                <span>Failed</span>
                <span className="font-mono text-red-300/75">{analytics.failedCalls}</span>
              </div>
            </section>
          </div>

          <section className="mt-5 overflow-x-auto rounded-xl border border-white/[0.08] bg-paper">
            <div className="grid min-w-[760px] grid-cols-[1.25fr_0.75fr_0.55fr_0.7fr_0.9fr] gap-3 border-b border-white/[0.08] px-5 py-3 font-mono text-[8px] uppercase tracking-[0.12em] text-forest/30">
              <span>Operation</span><span>API key</span><span>Status</span><span>Duration</span><span>Time</span>
            </div>
            {rows.length === 0 ? (
              <p className="p-10 text-center text-[12px] text-forest/40">No requests match these filters.</p>
            ) : (
              <ul className="min-w-[760px]">
                {rows.map((row) => (
                  <li key={row.$id} className="grid grid-cols-[1.25fr_0.75fr_0.55fr_0.7fr_0.9fr] gap-3 border-b border-white/[0.06] px-5 py-3.5 text-[11px] text-forest/50 last:border-b-0">
                    <span><code className="rounded bg-white/[0.06] px-2 py-1 font-mono text-[10px] text-forest/65">{row.operation}</code></span>
                    <span className="truncate">{row.keyName}</span>
                    <span><code className={`rounded px-2 py-1 font-mono text-[10px] ${row.status < 400 ? "bg-emerald/15 text-emerald" : "bg-red-500/10 text-red-300"}`}>{row.status}</code></span>
                    <span>{row.durationMs} ms</span>
                    <time dateTime={row.occurredAt}>{new Date(row.occurredAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {analytics.capped ? <p className="mt-3 text-[10px] text-amber-200/60">Metrics are capped at the 500 most recent requests in this window.</p> : null}
        </>
      )}
    </AppShell>
  );
}

export default function RequestsPage() {
  return <RequireAuth><RequestsView /></RequireAuth>;
}
