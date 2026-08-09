/* ────────────────────────────────────────────────────────────────
   Shared type atoms for the legal / contact routes.

   Legal copy is long-form reading, so this deliberately runs at a
   larger size and looser leading than the marketing page: 15px on a
   ~68ch measure rather than the 13.5px marketing body.

   @tailwindcss/typography isn't installed, so styling is explicit.
   ──────────────────────────────────────────────────────────────── */

/** A value only the operator can supply — renders as a visible
    highlight so an unfilled placeholder can't quietly ship. */
export function Fill({ children }: { children: React.ReactNode }) {
  return (
    <mark className="rounded bg-amber-200/60 px-1 py-[1px] font-mono text-[0.85em] text-forest ring-1 ring-amber-500/30">
      [{children}]
    </mark>
  );
}

export function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return (
    /* `.rule-t` draws its line with ::before, not a border — so
       `first:border-0` would do nothing here. Hide the pseudo-element
       itself on the first section. */
    <section className="rule-t mt-12 pt-10 first:mt-0 first:pt-0 first:before:hidden">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] font-semibold tracking-[0.1em] text-emerald/70">
          {n}
        </span>
        <h2
          id={id}
          className="scroll-mt-28 text-[clamp(1.2rem,2.2vw,1.55rem)] font-medium leading-[1.25] tracking-[-0.02em] text-forest"
        >
          {title}
        </h2>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[68ch] text-[15px] leading-[1.75] text-forest/80">{children}</p>
  );
}

export function Sub({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-7 text-[14px] font-semibold tracking-[-0.005em] text-forest">
      {children}
    </h3>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="max-w-[68ch] space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-[1.7] text-forest/80">
          <span
            className="mt-[9px] h-[4px] w-[4px] shrink-0 rounded-full bg-emerald/60"
            aria-hidden="true"
          />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** Definition rows — used for the "what we store" tables, where a
    label/value pair reads better than a run of prose. */
export function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="hairline max-w-[68ch] divide-y divide-forest/8 overflow-hidden rounded-xl border bg-paper-dim/40">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[170px_1fr] sm:gap-4">
          <dt className="font-mono text-[10px] font-semibold uppercase leading-[1.7] tracking-[0.1em] text-forest/50">
            {k}
          </dt>
          <dd className="text-[14px] leading-[1.65] text-forest/80">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Callout({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`max-w-[68ch] rounded-xl border px-5 py-4 text-[14px] leading-[1.7] ${
        tone === "warn"
          ? "border-amber-500/30 bg-amber-100/45 text-forest/85"
          : "border-emerald/25 bg-mint/15 text-forest/85"
      }`}
    >
      {children}
    </div>
  );
}

export function MailLink({ email }: { email: string }) {
  return (
    <a
      href={`mailto:${email}`}
      className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 transition-colors hover:decoration-emerald"
    >
      {email}
    </a>
  );
}
