"use client";

import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions";
import { mailto } from "@/lib/site";

/* ────────────────────────────────────────────────────────────────
   Email capture for the closing section.

   `useActionState` (React 19) rather than the removed `useFormState`.
   Because it's a real <form action={...}>, it still submits if JS
   hasn't loaded — Server Actions are progressively enhanced.

   The result is announced through an aria-live region: a colour
   change alone would leave screen-reader users with no feedback.
   ──────────────────────────────────────────────────────────────── */

const INITIAL: WaitlistState = { status: "idle", message: "" };

/** The dotted ring, matching the other CTAs. */
function DotRing() {
  const dots = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return { x: 11 + Math.cos(a) * 7.4, y: 11 + Math.sin(a) * 7.4 };
  });
  return (
    <svg viewBox="0 0 22 22" className="h-[15px] w-[15px]" aria-hidden="true">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="1.05" fill="currentColor" />
      ))}
    </svg>
  );
}

export default function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlist, INITIAL);

  if (state.status === "ok") {
    return (
      <div className="mx-auto mt-8 max-w-[30rem]">
        <div
          className="flex items-center justify-center gap-2.5 rounded-full border border-emerald/30 bg-mint/20 px-5 py-3"
          role="status"
        >
          <span className="text-[13px] text-emerald" aria-hidden="true">
            ✓
          </span>
          <p className="text-[13.5px] font-medium text-forest">{state.message}</p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="mx-auto mt-8 max-w-[30rem]">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="waitlist-email" className="sr-only">
            Email address
          </label>
          <input
            id="waitlist-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            aria-describedby="waitlist-note"
            aria-invalid={state.status === "error" || undefined}
            className="hairline h-11 w-full rounded-full border bg-paper px-5 text-[14px] text-forest placeholder:text-forest/35 focus:border-emerald/50 focus:outline-none focus:ring-2 focus:ring-emerald/20"
          />
        </div>

        {/* Honeypot — off-screen rather than display:none, which some
            bots detect. tabIndex/-1 and aria-hidden keep it away from
            keyboards and screen readers. */}
        <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="waitlist-company">Company</label>
          <input id="waitlist-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <input type="hidden" name="source" value="website · closing CTA" />

        <button
          type="submit"
          disabled={pending}
          className="flex h-11 shrink-0 items-center justify-center gap-2.5 rounded-full bg-forest pl-2 pr-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-paper transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper/15 text-mint">
            <DotRing />
          </span>
          {pending ? "Sending…" : "Request access"}
        </button>
      </div>

      {/* One live region for both the error and the resting hint, so
          the message replaces the hint rather than stacking under it. */}
      <p
        id="waitlist-note"
        aria-live="polite"
        className={`mt-3 min-h-[1.25rem] text-[11.5px] leading-[1.5] ${
          state.status === "error" ? "text-red-700/85" : "text-forest/50"
        }`}
      >
        {state.status === "error" ? (
          <>
            {state.message}{" "}
            <a
              href={mailto("Early access")}
              className="underline decoration-red-700/30 underline-offset-2"
            >
              Or email us.
            </a>
          </>
        ) : (
          "One email when there's something to try. No other mail, and no sharing."
        )}
      </p>
    </form>
  );
}
