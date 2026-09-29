import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { pageMetadata } from "@/lib/share-metadata";

/* ────────────────────────────────────────────────────────────────
   The page people land on when they search for the category rather
   than the brand: "ai agent memory", "memory for coding agents",
   "mcp memory server". The homepage is written for someone who already
   arrived; this one answers the question they searched.

   Every product claim here is checked against the code it describes:
   the tool names are the ones registered in hosted-mcp.ts, the install
   command is the one on /api-keys, and the review queue is /review.
   No benchmark numbers, no comparisons we cannot back up.
   ──────────────────────────────────────────────────────────────── */

const PATH = "/ai-agent-memory";
const TITLE = "AI agent memory for coding agents";
const DESCRIPTION =
  "What AI agent memory is, why a context window is not memory, and how a memory layer over MCP gives Claude Code, Cursor and your own agents durable project context.";

export const metadata: Metadata = pageMetadata({ path: PATH, title: TITLE, description: DESCRIPTION });

const TOOLS = [
  ["get_context", "Called first: the stack, decisions and conventions on record, within a token budget."],
  ["search_memory", "Looks up a past decision before the agent picks a library or pattern."],
  ["save_memory", "Records one durable fact you stated or confirmed. Never a guess."],
  ["capture_activity", "Queues inferred facts for review. They stay out of recall until approved."],
  ["forget_memory", "Deletes a memory you say was recorded in error."],
  ["list_entities", "Lists the tools, languages and concepts linked to this project's memories."],
  ["traverse_graph", "Shows the memories and entities connected to one entity."],
] as const;

const FAQ = [
  {
    question: "What is AI agent memory?",
    answer:
      "It is the store an agent reads from and writes to outside its context window, so facts learned in one session are available in the next. For a coding agent that means the project's stack, conventions, decisions and the reasons behind them.",
  },
  {
    question: "Isn't a large context window enough?",
    answer:
      "No. A context window holds one session and is cleared or compacted when it ends. Memory persists across sessions and across tools, and it has to decide what is still true, which a transcript never does.",
  },
  {
    question: "How does an agent use memory over MCP?",
    answer:
      "The Model Context Protocol lets any compatible client call a memory server's tools. The agent asks for context at the start of a task and saves durable facts as it learns them. One server can serve every MCP client you use.",
  },
  {
    question: "What should a good memory layer refuse to do?",
    answer:
      "Return a confident wrong answer. When nothing stored is about the question, returning nothing is better than returning the closest unrelated fact, because the agent will act on whatever it is given.",
  },
] as const;

function StructuredData() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${SITE_URL}${PATH}#article`,
        headline: TITLE,
        description: DESCRIPTION,
        url: `${SITE_URL}${PATH}`,
        inLanguage: "en",
        dateModified: "2026-09-27",
        about: ["AI agent memory", "Model Context Protocol", "Coding agents"],
        publisher: { "@id": `${SITE_URL}/#organization` },
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Brainfeather", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: TITLE, item: `${SITE_URL}${PATH}` },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      /* Built from the constants above, not user input. */
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}

const H2 = "mt-14 text-[clamp(1.4rem,3vw,1.9rem)] font-light leading-[1.15] tracking-[-0.02em] text-forest";
const P = "mt-4 max-w-[64ch] text-[15px] leading-[1.75] text-forest/75";

export default function AgentMemoryPage() {
  return (
    <article className="mx-auto w-full max-w-[900px] px-6 pb-24 pt-14">
      <StructuredData />
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
        Guide
      </p>
      <h1 className="mt-4 text-[clamp(2rem,5vw,3.1rem)] font-light leading-[1.08] tracking-[-0.03em] text-forest">
        AI agent memory for coding agents
      </h1>
      <p className={P}>
        A coding agent starts every session knowing nothing about your project. It relearns the
        stack, rediscovers the conventions, and asks again about decisions you already made.
        Agent memory is the layer that fixes this: a durable store the agent reads before it
        works and writes to as it learns.
      </p>

      <h2 className={H2}>A context window is not memory</h2>
      <p className={P}>
        The context window is working memory. It is fast, it holds one session, and it is
        compacted or cleared when that session ends. Long-term memory lives outside it. It
        survives restarts, it is shared between tools, and it has to answer a question a
        transcript never does: which of these facts is still true?
      </p>

      <h2 className={H2}>What a memory layer has to get right</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ["Keep what lasts", "Decisions, conventions and constraints, not greetings or thinking out loud."],
          ["Retire what changed", "A new decision replaces the old one instead of competing with it."],
          ["Stay in scope", "Facts from one repository, branch or task do not leak into another."],
          ["Decline when unsure", "Nothing relevant stored should mean nothing returned, not the nearest guess."],
        ].map(([head, body]) => (
          <li key={head} className="hairline rounded-xl border bg-paper-dim/40 px-5 py-4">
            <h3 className="text-[15px] font-medium text-forest">{head}</h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.7] text-forest/70">{body}</p>
          </li>
        ))}
      </ul>

      <h2 className={H2}>Memory over MCP</h2>
      <p className={P}>
        The Model Context Protocol (MCP) gives agents a standard way to call external tools. A
        memory server exposed over MCP works with every compatible client at once: Claude Code,
        Cursor, OpenCode and agents you build yourself read and write the same store, so a
        decision recorded in one is known to the others on their next run.
      </p>

      <h2 className={H2}>How Brainfeather does it</h2>
      <p className={P}>
        Brainfeather is a memory layer for coding agents, served over MCP. Memories are scoped
        to a repository and can be narrowed to a branch or a task. Inferred facts wait at a
        review queue and do not enter recall until you approve them, or until a later session
        captures the same fact again and it replaces nothing; those approvals can be undone for
        7 days. Superseded facts are kept
        for history but no longer returned.
      </p>
      <div className="hairline mt-6 overflow-hidden rounded-xl border">
        <table className="w-full text-left text-[13.5px]">
          <caption className="sr-only">Brainfeather MCP tools</caption>
          <thead className="bg-paper-dim/60 font-mono text-[10px] uppercase tracking-[0.1em] text-forest/55">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">Tool</th>
              <th scope="col" className="px-5 py-3 font-semibold">What it does</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map(([name, body]) => (
              <tr key={name} className="border-t border-forest/10">
                <td className="whitespace-nowrap px-5 py-3 font-mono text-[12.5px] text-forest">{name}</td>
                <td className="px-5 py-3 leading-[1.6] text-forest/75">{body}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={P}>
        Testers connect with an API key and run{" "}
        <code className="rounded bg-paper-dim px-1.5 py-0.5 font-mono text-[13px] text-forest">
          npx -y @brainfeather/mcp@1.7.0 init
        </code>{" "}
        once, which sets up automatic recall in Claude Code, Cursor and OpenCode.
      </p>
      <p className={P}>
        Brainfeather is listed in the{" "}
        <a
          href="https://registry.modelcontextprotocol.io/v0/servers?search=com.brainfeather/mcp"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald"
        >
          official MCP Registry
        </a>{" "}
        and on{" "}
        <a
          href="https://smithery.ai/servers/getbrainfeather/brainfeather"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald"
        >
          Smithery
        </a>
        .
      </p>

      <h2 className={H2}>Questions</h2>
      <dl className="mt-4 divide-y divide-forest/10">
        {FAQ.map(({ question, answer }) => (
          <div key={question} className="py-5">
            <dt className="text-[15px] font-medium text-forest">{question}</dt>
            <dd className="mt-2 max-w-[64ch] text-[14px] leading-[1.7] text-forest/70">{answer}</dd>
          </div>
        ))}
      </dl>

      <div className="rule-t mt-12 pt-10">
        <p className="text-[15px] leading-[1.7] text-forest/75">
          Brainfeather is in early development and free while it is.{" "}
          <Link
            href="/#waitlist"
            className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald"
          >
            Request access
          </Link>{" "}
          or{" "}
          <Link
            href="/contact"
            className="font-medium text-emerald underline decoration-emerald/30 underline-offset-2 hover:decoration-emerald"
          >
            get in touch
          </Link>
          .
        </p>
      </div>
    </article>
  );
}
