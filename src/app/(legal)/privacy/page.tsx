import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";
import {
  Bullets,
  Callout,
  Fill,
  MailLink,
  P,
  Rows,
  Section,
  Sub,
} from "@/components/LegalProse";

export const metadata: Metadata = {
  /* No "— Brainfeather" suffix: the root layout's title template adds
     it, so spelling it out here would render it twice. */
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy" },
  description:
    "What Brainfeather collects, what it stores from your coding sessions, how long it keeps it, and how to get it deleted.",
};

/* Hardcoded, not `new Date()`: a computed date would silently change
   on every rebuild and misrepresent when the terms last changed. */
const UPDATED = "8 August 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[820px] px-6 pb-24 pt-14">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
        Legal
      </p>
      <h1 className="mt-4 text-[clamp(2rem,5vw,3.1rem)] font-light leading-[1.08] tracking-[-0.03em] text-forest">
        Privacy Policy
      </h1>
      <p className="mt-5 max-w-[62ch] text-[15px] leading-[1.7] text-forest/70">
        Brainfeather stores facts extracted from your coding sessions. That is unusually
        sensitive data, so this policy is specific about what is kept and what is not.
      </p>
      <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.11em] text-forest/45">
        Last updated {UPDATED}
      </p>

      <div className="mt-10">
        <Callout tone="warn">
          <strong className="font-semibold">Draft — needs a lawyer.</strong> This document was
          drafted from the behaviour of the current codebase, not by a solicitor, and it is
          not legal advice. Every{" "}
          <span className="font-mono text-[0.85em]">[highlighted]</span> value below must be
          filled in, and the whole thing reviewed against the law where you operate, before
          you rely on it publicly.
        </Callout>
      </div>

      <div className="mt-14">
        <Section n="01" title="Who we are">
          <P>
            Brainfeather (&ldquo;Brainfeather&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides
            a long-term memory layer for AI coding agents. The data controller is{" "}
            <Fill>legal entity name</Fill>, registered at <Fill>registered address</Fill>.
            You can reach us at <MailLink email={CONTACT_EMAIL} />.
          </P>
          <P>
            Brainfeather is in early development and is not yet generally available. Where
            this policy describes product behaviour, it describes the service as currently
            built.
          </P>
        </Section>

        <Section n="02" title="Information you give us">
          <Rows
            rows={[
              [
                "Account",
                "Email address, name, and a password. Passwords are handled by our authentication provider and we never receive or store them in readable form.",
              ],
              [
                "Waitlist",
                <>
                  If you use the early-access form, your email address, the date and time you
                  submitted it, and which part of the site you submitted it from. This is
                  recorded in a Google Sheet we control (see section 06) and used only to
                  contact you about access.
                </>,
              ],
              [
                "Support",
                "Anything you put in an email to us, including the message body and any attachments.",
              ],
              [
                "Billing",
                <>
                  Not applicable yet — Brainfeather takes no payments at this stage. If that
                  changes, payment details will be handled by <Fill>payment processor</Fill>{" "}
                  and never touch our servers.
                </>,
              ],
            ]}
          />
        </Section>

        <Section n="03" title="What we store from your sessions">
          <P>
            This is the part worth reading closely. Brainfeather works by recording durable
            facts from your work and handing them back to your agent later, which means the
            store can contain material about your projects.
          </P>
          <Rows
            rows={[
              [
                "Memories",
                "A title and body of text for each recorded fact, plus a category, tags, the client it came from, and encrypted metadata used for project scoping and retrieval. Search ranks decrypted candidates in Brainfeather's server process using lexical, related-concept, entity and recency signals; it does not store or send vector embeddings. The body is written from your sessions and can therefore include source code, file paths, architecture decisions, dependency choices and similar project detail.",
              ],
              [
                "Context rules",
                "Rules you define to shape what gets recalled, including the condition and context text you write.",
              ],
              [
                "Patterns",
                "Observed repetition — recurring tasks, frequent questions, workflow habits — with a frequency count and when it was last seen.",
              ],
              [
                "Decisions",
                "For team workspaces: a title, the surrounding context, the outcome, and which members took part.",
              ],
              [
                "Teams",
                "Workspace names, ownership, and member roles.",
              ],
              [
                "API keys",
                "A generated key per integration, its label, and when it was last used.",
              ],
              [
                "Usage",
                "A count of stored memories and a last-active timestamp on your account.",
              ],
            ]}
          />
          <Callout>
            <strong className="font-semibold">You choose what is captured.</strong>{" "}
            Brainfeather filters conversational noise and aims to keep only durable project
            facts, but it cannot reliably recognise a secret that was pasted into a session.
            Treat the store as you would a private repository: do not paste credentials,
            tokens, personal data about others, or client-confidential material into a
            session you are recording.
          </Callout>
        </Section>

        <Section n="04" title="What we do not do">
          <Bullets
            items={[
              <>
                <strong className="font-semibold">No analytics or tracking.</strong> This
                website runs no analytics, no advertising pixels, and no third-party
                tracking scripts. It sets no cookies for analytics or advertising.
              </>,
              <>
                <strong className="font-semibold">No selling.</strong> We do not sell or rent
                your personal information, and we do not share it with advertisers.
              </>,
              <>
                <strong className="font-semibold">No training on your content.</strong> We do
                not use your stored memories to train machine-learning models.
              </>,
            ]}
          />
        </Section>

        <Section n="05" title="How we use your information">
          <Bullets
            items={[
              "To run the service: storing your memories and returning them to the clients you connect.",
              "To authenticate you and keep your account secure.",
              "To reply when you contact us.",
              "To diagnose faults and keep the service reliable.",
              "To tell you about material changes to the service or to this policy.",
            ]}
          />
          <Sub>Legal bases</Sub>
          <P>
            If you are in the UK or EEA, we rely on performance of a contract for running the
            service, our legitimate interests for security and troubleshooting, and your
            consent where consent is what applies — for example a waitlist email, which you
            can withdraw at any time. Our supervisory authority is{" "}
            <Fill>lead supervisory authority</Fill>.
          </P>
        </Section>

        <Section n="06" title="Who processes your data">
          <P>
            We keep the list of subprocessors short, and we do not add one without a reason.
          </P>
          <Rows
            rows={[
              [
                "Appwrite",
                <>
                  Backend platform. Hosts authentication and the databases holding the
                  records described in section 03. Data is stored in its{" "}
                  <Fill>Appwrite region — Singapore unless you chose otherwise</Fill> cluster.
                </>,
              ],
              [
                "Vercel",
                <>
                  Serves this website from a global edge network, which means a page request
                  is answered from a location near you rather than from one country. Vercel
                  processes request metadata (IP address, user agent) to route and serve
                  traffic.
                </>,
              ],
              [
                "Google",
                <>
                  Early-access sign-ups are written to a Google Sheet via Google Apps Script,
                  and our contact address is a Gmail account. Google therefore processes the
                  email address you submit and anything you send us by email. Google&apos;s own{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald"
                  >
                    privacy policy
                  </a>{" "}
                  applies to that processing.
                </>,
              ],
            ]}
          />
          <P>
            We may also disclose information where the law requires it, or to establish or
            defend legal claims. If we are ever involved in a merger or acquisition, we will
            tell you before your information moves to a new controller.
          </P>
        </Section>

        <Section n="07" title="How long we keep it">
          <Bullets
            items={[
              "Account records: for as long as your account is open.",
              "Early-access sign-ups: until access opens and we've contacted you, or until you ask to be removed — whichever comes first. Ask by replying to any email from us, or by writing to the address below.",
              "Memories, rules, patterns and decisions: until you delete them, or until you close your account.",
              "API keys: until you revoke them.",
              <>
                After you close your account we delete or irreversibly anonymise your data
                within <Fill>retention window, e.g. 30 days</Fill>, except where we must keep
                something to meet a legal obligation.
              </>,
              "Backups may hold deleted content for a short additional period before they roll over.",
            ]}
          />
        </Section>

        <Section n="08" title="Security">
          <P>
            Traffic to Brainfeather is served over HTTPS. Access to stored records is scoped
            per account, and authentication is handled by our backend provider rather than
            rolled by hand.
          </P>
          <Callout tone="warn">
            <strong className="font-semibold">Being straight with you:</strong> Brainfeather is
            early software built by a small team, and it has not been through an independent
            security audit or a penetration test. It should not yet be trusted with material
            you could not afford to have exposed. We will update this section as that
            changes — and we would rather say so here than imply a maturity we have not
            earned.
          </Callout>
          <P>
            If you find a vulnerability, please report it to <MailLink email={CONTACT_EMAIL} />{" "}
            rather than disclosing it publicly, and give us a reasonable window to fix it.
          </P>
        </Section>

        <Section n="09" title="Your rights">
          <P>
            Depending on where you live, you may have the right to access a copy of your
            data, correct it, delete it, restrict or object to how we use it, take it
            elsewhere in a portable format, and withdraw consent you previously gave. You
            also have the right to complain to your data protection regulator.
          </P>
          <P>
            To exercise any of these, email <MailLink email={CONTACT_EMAIL} />. We will
            respond within one month. We will not charge you for a reasonable request, and we
            will not treat you differently for making one.
          </P>
        </Section>

        <Section n="10" title="International transfers">
          <P>
            Your information may be processed in a country other than your own, including{" "}
            <Fill>country</Fill>. Where we move personal data out of the UK or EEA we rely on{" "}
            <Fill>transfer mechanism, e.g. UK IDTA / EU Standard Contractual Clauses</Fill>.
          </P>
        </Section>

        <Section n="11" title="Children">
          <P>
            Brainfeather is a developer tool and is not intended for anyone under 16. We do
            not knowingly collect information from children. If you believe a child has given
            us data, contact us and we will delete it.
          </P>
        </Section>

        <Section n="12" title="Changes to this policy">
          <P>
            When this policy changes we will update the date at the top. For changes that
            materially affect your rights we will give notice by email or in the product
            before they take effect.
          </P>
        </Section>

        <Section n="13" title="Contact">
          <P>
            Questions, requests, or complaints: <MailLink email={CONTACT_EMAIL} />. You can
            also use the <Link href="/contact" className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald">contact page</Link>.
          </P>
          <P>
            See also our{" "}
            <Link
              href="/terms"
              className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald"
            >
              Terms of Service
            </Link>
            .
          </P>
        </Section>
      </div>
    </div>
  );
}
