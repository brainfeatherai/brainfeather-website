import type { Metadata } from "next";
import Link from "next/link";
import { SocialLinks } from "@/components/SiteFooter";
import { CONTACT_EMAIL, mailto } from "@/lib/site";

export const metadata: Metadata = {
  /* Suffix omitted — the root layout's title template appends it. */
  title: "Contact",
  alternates: { canonical: "/contact" },
  openGraph: { url: "/contact" },
  description:
    "Get in touch with Brainfeather: support, security reports, privacy requests, and press.",
};

/* ────────────────────────────────────────────────────────────────
   One inbox, several reasons to use it. Rather than a single mailto,
   each row prefills a subject line — which costs nothing and makes
   triage possible on the receiving end.

   No contact form: a form needs a backend route, spam handling and a
   privacy notice of its own. A mailto works today and doesn't pretend
   to deliver something it can't.
   ──────────────────────────────────────────────────────────────── */

const REASONS = [
  {
    head: "General & support",
    body: "Questions about the product, something broken, or help getting a client connected.",
    subject: "Support",
    primary: true,
  },
  {
    head: "Early access",
    body: "Want in while it's still being built, or have a use case you'd like shaped in.",
    subject: "Early access",
  },
  {
    head: "Security",
    body: "Found a vulnerability? Report it here first and give us a reasonable window before disclosing publicly.",
    subject: "Security report",
  },
  {
    head: "Privacy & your data",
    body: "Access, correction, export, or deletion of your data. We respond within one month.",
    subject: "Privacy request",
  },
  {
    head: "Press & partnerships",
    body: "Media enquiries, integrations, or anything commercial.",
    subject: "Press / partnership",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-6 pb-24 pt-14">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
        Contact
      </p>
      <h1 className="mt-4 text-[clamp(2rem,5vw,3.1rem)] font-light leading-[1.08] tracking-[-0.03em] text-forest">
        Get in touch
      </h1>
      <p className="mt-5 max-w-[58ch] text-[15px] leading-[1.7] text-forest/70">
        Brainfeather is built by a small team, so email reaches a person rather than a queue.
        Pick the closest reason below and the subject line will be filled in for you.
      </p>

      {/* The address, stated plainly and once — some people just want
          to copy it rather than trust a mailto handler. */}
      <div className="hairline mt-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-paper-dim/50 px-6 py-5">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-forest/45">
            Email
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-1.5 block break-all font-mono text-[15px] font-medium text-forest underline decoration-forest/20 underline-offset-[3px] transition-colors hover:decoration-forest"
          >
            {CONTACT_EMAIL}
          </a>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-forest/45">
          Typical reply · 1–2 days
        </p>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {REASONS.map((r) => (
          <li key={r.head} className={r.primary ? "sm:col-span-2" : undefined}>
            <a
              href={mailto(r.subject)}
              className="hairline group flex h-full flex-col rounded-xl border bg-paper px-6 py-5 transition-[border-color,box-shadow] duration-300 hover:border-emerald/35 hover:shadow-[0_16px_40px_-24px_rgba(20,52,43,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[16px] font-medium tracking-[-0.01em] text-forest">
                  {r.head}
                </h2>
                <span
                  className="font-mono text-[13px] text-emerald/70 transition-transform duration-300 group-hover:translate-x-0.5"
                  aria-hidden="true"
                >
                  →
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-[1.7] text-forest/70">{r.body}</p>
              <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.11em] text-forest/40">
                Subject · [{r.subject}]
              </p>
            </a>
          </li>
        ))}
      </ul>

      <div className="rule-t mt-14 pt-10">
        <h2 className="text-[15px] font-semibold text-forest">Elsewhere</h2>
        <p className="mt-2 max-w-[58ch] text-[14px] leading-[1.7] text-forest/70">
          We post progress as it happens. For anything needing a reply, email is still the
          reliable route.
        </p>
        <div className="mt-4">
          <SocialLinks tone="light" />
        </div>
      </div>

      <div className="rule-t mt-12 pt-10">
        <p className="text-[14px] leading-[1.7] text-forest/70">
          See also our{" "}
          <Link
            href="/privacy"
            className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald"
          >
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link
            href="/terms"
            className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald"
          >
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
