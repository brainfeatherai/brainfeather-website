"use client";

/* ────────────────────────────────────────────────────────────────
   LoginView — the sign-in / sign-up form.

   Split from the route so `page.tsx` can stay a server component and
   read `searchParams` there. The OAuth failure flag arrives as a prop
   and seeds `error` through a useState initialiser; deriving it from
   `window.location.search` in an effect meant calling setState during
   render-commit, which eslint's react-hooks/set-state-in-effect flags
   and which paints the form once before the message appears.

   Split panel: dark plate with the feather, cream form. Mirrors the
   landing page's forest-deep field / cream sheet so this does not read
   as a bolted-on admin screen. The dark half is decorative and hidden
   below lg — on a phone it would push the form below the fold.

   Not a Server Action, unlike WaitlistForm: the Appwrite web SDK keeps
   the session in a cookie scoped to the Appwrite domain, so a session
   opened on the server is invisible to the browser client every later
   read goes through. Auth has to run client-side.
   ──────────────────────────────────────────────────────────────── */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const FIELD =
  "hairline h-11 w-full rounded-full border bg-paper px-5 text-[14px] text-forest placeholder:text-forest/35 focus:border-emerald/50 focus:outline-none focus:ring-2 focus:ring-emerald/20";

const PROMISES = [
  "Survives the session",
  "Retracts what changed",
  "Every client, one store",
] as const;

function DotRing() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <circle
        cx="6.5"
        cy="6.5"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="1.6 2.2"
      />
      <circle cx="6.5" cy="6.5" r="1.7" fill="currentColor" />
    </svg>
  );
}

/** Appwrite's copy is user-facing enough to surface, except the 401,
    which is phrased for developers. Only that one is rewritten. */
function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/invalid credentials/i.test(raw)) {
    return "That email and password do not match an account.";
  }
  return raw || "Something went wrong. Try again.";
}

export default function LoginView({ inviteId }: { inviteId: string | null }) {
  const { user, loading, login, signup } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">(inviteId ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignup = mode === "signup";

  // Already signed in? Skip the form. A navigation, not a state write.
  useEffect(() => {
    if (!loading && user) router.replace("/overview");
  }, [loading, user, router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (isSignup) {
        if (!inviteId) throw new Error("A valid Brainfeather invitation is required.");
        await signup(email, password, name.trim(), inviteId);
      }
      else await login(email, password);
      router.replace("/overview");
    } catch (err) {
      setError(readableError(err));
      setPending(false); // still mounted on failure, so re-enable
    }
  }

  return (
    <div className="flex flex-1 lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── dark plate ─────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-forest-deep lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Absolute, not a flex child: this panel is `justify-between`, so
            an in-flow element here — even a zero-height one — becomes a
            fourth item and redistributes the vertical spacing. `.grain`
            styles only ::after, so placement has to come from here. */}
        <div className="grain absolute inset-0" aria-hidden="true" />

        <Link
          href="/"
          className="relative z-10 flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mint/50"
        >
          {/* The real mark, same asset and sizing SiteNav uses on the home
              page. Previously a tinted crop of feather.png, which is the
              decorative plume — not the logo. */}
          <Image
            src="/logo-white.png"
            alt="Brainfeather"
            width={36}
            height={36}
            priority
            className="h-9 w-9 object-contain"
          />
          <span className="text-[18.5px] font-medium tracking-tight text-paper">
            brainfeather
          </span>
        </Link>

        <div className="relative z-10 max-w-sm">
          <h2 className="text-[clamp(1.7rem,3vw,2.5rem)] font-light leading-[1.08] tracking-[-0.03em] text-paper">
            Your AI remembers
            <br />
            what matters.
          </h2>
          <ul className="mt-8 flex flex-col gap-3">
            {PROMISES.map((line) => (
              <li key={line} className="flex items-center gap-3">
                <span className="text-mint">
                  <DotRing />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-paper/60">
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 font-mono text-[9.5px] uppercase tracking-[0.12em] text-paper/35">
          In early development
        </p>

        {/* The plume, cropped by the panel. Same treatment as the hero:
            tinted, drifting, inert — .drift zeroes itself under
            prefers-reduced-motion. */}
        <Image
          src="/feather.png"
          alt=""
          width={382}
          height={653}
          priority
          aria-hidden="true"
          className="feather-tint drift pointer-events-none absolute -bottom-24 -right-16 z-0 h-[440px] w-auto opacity-25"
        />
      </aside>

      {/* ── form ───────────────────────────────────────────────── */}
      <main className="flex flex-1 items-center justify-center px-5 py-14">
        <div className="w-full max-w-[366px]">
          <Link
            href="/"
            className="inline-flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald/50 lg:hidden"
          >
            {/* Black variant here — this one sits on the cream panel. */}
            <Image
              src="/logo-black.png"
              alt="Brainfeather"
              width={36}
              height={36}
              className="h-7 w-7 object-contain"
            />
            <span className="text-[16px] font-medium tracking-tight text-forest">
              brainfeather
            </span>
          </Link>

          <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-[-0.03em] text-forest lg:mt-0">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-[14px] text-forest/60">
            {isSignup
              ? "Memory that outlives the chat window."
              : "Approved accounts can access the console here."}
          </p>

          <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-3">
            {isSignup ? (
              <div>
                <label htmlFor="name" className="sr-only">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={FIELD}
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                aria-invalid={error ? true : undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD}
              />
            </div>

            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={
                  isSignup ? "Password — 8 or more characters" : "Password"
                }
                aria-invalid={error ? true : undefined}
                aria-describedby="auth-note"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD}
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="mt-1 flex h-11 items-center justify-center gap-2.5 rounded-full bg-forest pl-2 pr-5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-paper transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper/15 text-mint">
                <DotRing />
              </span>
              {pending
                ? isSignup
                  ? "Creating…"
                  : "Signing in…"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>

            {/* One live region: the hint is replaced by the error rather
                than stacked under it, matching WaitlistForm. */}
            <p
              id="auth-note"
              aria-live="polite"
              className={`min-h-[1.25rem] text-[12px] ${
                error ? "text-red-700" : "text-forest/45"
              }`}
            >
              {error ?? (isSignup ? "At least 8 characters." : "\u00A0")}
            </p>
          </form>

          {inviteId ? (
            <p className="mt-6 text-[13px] text-forest/60">
              {isSignup ? "Already have an account?" : "Need to use this invitation?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(isSignup ? "signin" : "signup");
                  setError(null);
                }}
                className="font-semibold text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/50"
              >
                {isSignup ? "Use existing account" : "Create invited account"}
              </button>
            </p>
          ) : (
            <p className="mt-6 text-[12px] leading-relaxed text-forest/45">
              Account creation is invite-only. Request access from the Brainfeather homepage.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
