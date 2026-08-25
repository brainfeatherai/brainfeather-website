"use client";

import { useState } from "react";

export default function SentryExampleClient() {
  const [serverStatus, setServerStatus] = useState<string | null>(null);

  async function testServerError() {
    setServerStatus("Sending server test error…");
    try {
      const response = await fetch("/api/sentry-example-api", {
        cache: "no-store",
      });
      if (response.ok) {
        setServerStatus("The test route did not fail as expected.");
        return;
      }
      setServerStatus(
        `Server returned ${response.status}. Check Sentry Issues for “Handled server failure: sentry.test_server”.`,
      );
    } catch {
      setServerStatus("The server test request could not be completed.");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-5 py-12 text-forest">
      <section className="w-full max-w-xl rounded-[28px] border border-forest/10 bg-paper p-7 shadow-[0_22px_70px_rgba(13,38,32,0.08)] sm:p-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-forest/40">
          Diagnostics
        </p>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">
          Verify Sentry
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-forest/60">
          Send one browser error and one server error, then confirm both appear in the
          Brainfeather project&apos;s Issues view.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              throw new Error("Sentry Example Frontend Error");
            }}
            className="rounded-full bg-forest px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-paper transition-transform hover:scale-[1.02]"
          >
            Trigger browser error
          </button>
          <button
            type="button"
            onClick={testServerError}
            className="rounded-full border border-forest/15 bg-paper-dim px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-forest transition-colors hover:border-forest/30"
          >
            Trigger server error
          </button>
        </div>

        <p aria-live="polite" className="mt-4 min-h-10 text-[12px] leading-relaxed text-forest/50">
          {serverStatus ??
            "This verification surface is available in development only."}
        </p>
      </section>
    </main>
  );
}
