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
  /* Suffix omitted — the root layout's title template appends it. */
  title: "Terms of Service",
  description:
    "The terms that govern your use of Brainfeather, including acceptable use, who owns what, and the limits of an early-development service.",
};

const UPDATED = "8 August 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-[820px] px-6 pb-24 pt-14">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
        Legal
      </p>
      <h1 className="mt-4 text-[clamp(2rem,5vw,3.1rem)] font-light leading-[1.08] tracking-[-0.03em] text-forest">
        Terms of Service
      </h1>
      <p className="mt-5 max-w-[62ch] text-[15px] leading-[1.7] text-forest/70">
        The agreement between you and Brainfeather. It is written to be read — plain
        sentences, no capitalised walls of text.
      </p>
      <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.11em] text-forest/45">
        Last updated {UPDATED}
      </p>

      <div className="mt-10">
        <Callout tone="warn">
          <strong className="font-semibold">Draft — needs a lawyer.</strong> Drafted from how
          the product currently works, not by a solicitor, and not legal advice. Fill every{" "}
          <span className="font-mono text-[0.85em]">[highlighted]</span> value and have it
          reviewed for your jurisdiction before relying on it. Liability and warranty clauses
          in particular are only enforceable if they are drafted correctly for where you
          operate.
        </Callout>
      </div>

      <div className="mt-14">
        <Section n="01" title="Agreement to these terms">
          <P>
            These terms are between you and <Fill>legal entity name</Fill>
            (&ldquo;Brainfeather&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an
            account or using the service you agree to them. If you do not agree, do not use
            the service.
          </P>
          <P>
            If you are agreeing on behalf of a company, you confirm you have the authority to
            bind that company, and &ldquo;you&rdquo; means the company.
          </P>
        </Section>

        <Section n="02" title="Early development">
          <P>
            Brainfeather is in early development. That has practical consequences you should
            price in before depending on it:
          </P>
          <Bullets
            items={[
              "Features may change, move, or be withdrawn without a deprecation period.",
              "There is no uptime commitment and no service level agreement.",
              "Data loss is possible. Keep your own copy of anything you cannot afford to lose.",
              "The service has not had an independent security audit.",
            ]}
          />
          <P>
            We will give notice of breaking changes where we reasonably can, but during this
            phase we cannot promise stability.
          </P>
        </Section>

        <Section n="03" title="Eligibility and your account">
          <Bullets
            items={[
              "You must be at least 16 years old to use Brainfeather.",
              "Give accurate account information and keep it current.",
              "You are responsible for what happens under your account, including anything done with your API keys.",
              "Keep your password and API keys secret. Tell us promptly if you think either has been exposed.",
            ]}
          />
          <P>
            You may close your account at any time by emailing{" "}
            <MailLink email={CONTACT_EMAIL} />.
          </P>
        </Section>

        <Section n="04" title="Acceptable use">
          <P>Do not use Brainfeather to:</P>
          <Bullets
            items={[
              "Break the law, or help anyone else break it.",
              "Store or process material you have no right to hold — including someone else's confidential information or personal data you have no lawful basis for.",
              "Attack, probe, or overload the service or the infrastructure it runs on, beyond good-faith security research reported to us privately.",
              "Get around usage limits, quotas, or access controls, including by using multiple accounts to do so.",
              "Resell or offer the service to third parties as your own without a written agreement with us.",
              "Upload malware, or use the service to build or distribute it.",
              "Scrape or bulk-extract data belonging to other users.",
            ]}
          />
          <P>
            We may suspend an account that is causing harm to the service or to other users,
            and where possible we will tell you why.
          </P>
        </Section>

        <Section n="05" title="Your content">
          <Sub>You own it</Sub>
          <P>
            The memories, rules, decisions and other material you put into Brainfeather remain
            yours. We claim no ownership of them.
          </P>
          <Sub>The licence we need to run the service</Sub>
          <P>
            You grant us a limited, non-exclusive, worldwide, royalty-free licence to host,
            store, copy, transmit and display your content strictly so we can operate the
            service for you — for example storing a fact, indexing it so it can be searched,
            and returning it to a client you have connected. That licence ends when you delete
            the content or close your account, apart from copies sitting in routine backups
            until they roll over.
          </P>
          <P>
            We do not use your content to train machine-learning models. See the{" "}
            <Link
              href="/privacy"
              className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald"
            >
              Privacy Policy
            </Link>{" "}
            for what we store in detail.
          </P>
          <Sub>You are responsible for what you put in</Sub>
          <P>
            You confirm you have the right to store the content you store, and that doing so
            does not infringe anyone else&apos;s rights or breach an obligation you owe
            someone — an employer&apos;s policy or a client NDA, for instance.
          </P>
        </Section>

        <Section n="06" title="Our intellectual property">
          <P>
            The Brainfeather software, name, logo and design are ours and are protected by
            intellectual property law. These terms give you a right to use the service, not
            ownership of it. Do not copy, reverse-engineer, or create derivative works from
            the service except where the law says you may regardless of contract.
          </P>
        </Section>

        <Section n="07" title="Third-party clients and services">
          <P>
            Brainfeather connects to editors and agents built by other people — Claude Code,
            Cursor, opencode, Antigravity and other MCP clients among them. We do not control
            those tools, we are not responsible for what they do with data you route through
            them, and their own terms apply to your use of them. Names and marks of those
            products belong to their respective owners and are used here only to describe
            compatibility.
          </P>
        </Section>

        <Section n="08" title="Fees">
          <P>
            Brainfeather is currently free to use and takes no payments. If we introduce paid
            plans we will publish the pricing and give existing users notice before charging
            anything. Nothing here obliges you to pay for a plan you have not signed up to.
          </P>
        </Section>

        <Section n="09" title="Availability and changes">
          <P>
            We may modify, suspend or discontinue any part of the service. We may also impose
            or adjust usage limits. Where a change materially reduces what you can do, we will
            give reasonable notice by email or in the product unless the change is needed for
            security or legal reasons.
          </P>
        </Section>

        <Section n="10" title="Disclaimers">
          <P>
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
            warranties of any kind, whether express or implied, including implied warranties
            of merchantability, fitness for a particular purpose, and non-infringement. We do
            not warrant that the service will be uninterrupted, error-free, or that stored
            facts will always be recalled accurately or completely.
          </P>
          <Callout>
            Brainfeather returns recorded facts to a language model, which then writes code.
            Review what your agent produces. A recalled fact can be out of date, and the
            model can misapply a correct one. Judgement stays with you.
          </Callout>
          <P>
            Nothing in these terms excludes liability that cannot lawfully be excluded —
            including, in the UK and EU, liability for death or personal injury caused by
            negligence, or for fraud. Consumers keep their statutory rights.
          </P>
        </Section>

        <Section n="11" title="Limitation of liability">
          <P>
            To the fullest extent the law allows, we are not liable for indirect, incidental,
            special, consequential or punitive damages, nor for lost profits, lost revenue,
            lost data, or business interruption, even if we were told such damage was
            possible.
          </P>
          <P>
            Our total aggregate liability arising out of or relating to the service is limited
            to the greater of the amount you paid us in the twelve months before the claim, or{" "}
            <Fill>cap amount, e.g. £100</Fill>. Because the service is currently free, that
            first figure will usually be zero.
          </P>
        </Section>

        <Section n="12" title="Indemnity">
          <P>
            You agree to indemnify us against claims, losses and reasonable legal costs
            arising from your breach of these terms, your misuse of the service, or content
            you stored that you had no right to store. This does not apply to the extent the
            claim results from our own breach or negligence.
          </P>
        </Section>

        <Section n="13" title="Termination">
          <P>
            You may stop using Brainfeather and close your account at any time. We may suspend
            or terminate your access if you materially breach these terms, if your use puts
            the service or other users at risk, or if we are required to by law. Where the
            circumstances allow it we will warn you first and give you a chance to put things
            right.
          </P>
          <P>
            On termination your right to use the service ends. We will make your data
            available for export for a reasonable period where we can, then delete it as
            described in the Privacy Policy.
          </P>
        </Section>

        <Section n="14" title="Governing law and disputes">
          <Rows
            rows={[
              [
                "Governing law",
                <>
                  <Fill>governing law, e.g. the laws of England and Wales</Fill>
                </>,
              ],
              [
                "Courts",
                <>
                  <Fill>exclusive jurisdiction, e.g. the courts of England and Wales</Fill>
                </>,
              ],
              [
                "First step",
                <>
                  Before filing anything, email <MailLink email={CONTACT_EMAIL} /> — most
                  disputes are cheaper and faster to resolve in a thread.
                </>,
              ],
            ]}
          />
          <P>
            If you are a consumer, this clause does not deprive you of the right to bring
            proceedings in the courts of the country where you live.
          </P>
        </Section>

        <Section n="15" title="General">
          <Bullets
            items={[
              "These terms, together with the Privacy Policy, are the whole agreement between us about the service.",
              "If a provision is found unenforceable, the rest stays in force.",
              "Our not enforcing a term on one occasion does not waive it.",
              "You may not transfer these terms without our consent. We may transfer them to an affiliate or in connection with a merger or acquisition.",
              "Nothing here creates a partnership, agency, or employment relationship.",
            ]}
          />
        </Section>

        <Section n="16" title="Changes to these terms">
          <P>
            We will update the date at the top when these terms change, and give notice of
            material changes by email or in the product before they take effect. Continuing to
            use the service after a change takes effect means you accept the revised terms.
          </P>
        </Section>

        <Section n="17" title="Contact">
          <P>
            Questions about these terms: <MailLink email={CONTACT_EMAIL} />, or the{" "}
            <Link
              href="/contact"
              className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald"
            >
              contact page
            </Link>
            .
          </P>
        </Section>
      </div>
    </div>
  );
}
