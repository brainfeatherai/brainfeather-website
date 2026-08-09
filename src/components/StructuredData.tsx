import { SITE_URL, SOCIALS } from "@/lib/site";

/* ────────────────────────────────────────────────────────────────
   JSON-LD structured data.

   This is the part of SEO that actually moves a brand name: it tells
   search engines that "Brainfeather" is a specific ORGANISATION with a
   specific site and specific social profiles, rather than two English
   words that happen to appear together. `sameAs` is the key field —
   linking the verified social accounts is how entity disambiguation
   works.

   Deliberately NOT included:
   · `aggregateRating` / `review` — there are no reviews. Fabricating
     them is a manual-action risk, not a shortcut.
   · `offers` / `price` — nothing is for sale yet.
   · `datePublished` on a product that hasn't shipped.

   Every claim below is one that can be checked against the live site.
   ──────────────────────────────────────────────────────────────── */

const NAME = "Brainfeather";
const DESCRIPTION =
  "Brainfeather is a long-term memory layer for AI coding agents. It records the durable facts about your project — stack, conventions, decisions — and hands them back to Claude Code, Cursor and your own agents on the next run, so each session doesn't start from zero.";

export default function StructuredData() {
  const graph = {
    "@context": "https://schema.org",
    /* One @graph with cross-references, rather than three loose blocks:
       the @id links let a crawler see that the organisation, the site
       and the product are the same entity. */
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: NAME,
        url: SITE_URL,
        description: DESCRIPTION,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/logo-black.png`,
        },
        sameAs: SOCIALS.map((s) => s.href),
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "getbrainfeather@gmail.com",
          url: `${SITE_URL}/contact`,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: NAME,
        description: DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: NAME,
        applicationCategory: "DeveloperApplication",
        applicationSubCategory: "AI memory layer",
        operatingSystem: "Any",
        description: DESCRIPTION,
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
        /* Honest about status: the product is pre-release, so this says
           so rather than implying general availability. */
        releaseNotes: "In early development. Join the waitlist for access.",
        featureList: [
          "Long-term memory for AI coding agents",
          "Background fact capture with no added latency",
          "Stale facts retired rather than outranked",
          "Shared across every connected client",
          "Model Context Protocol (MCP) server",
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      /* JSON.stringify output is machine-generated from the object
         above, not user input, so there is no injection surface here. */
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
