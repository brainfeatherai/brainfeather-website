import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";

/* Serves /llms.txt — the emerging convention for describing a site to
   LLMs and AI crawlers in plain prose, rather than making them infer it
   from rendered marketing HTML.

   Worth having because a growing share of tool discovery happens by
   asking an assistant "what should I use for X" rather than by search.
   Competitors in this space already publish one.

   A route handler rather than a static public/llms.txt file so the
   domain and contact address come from the same constants as the rest
   of the site and cannot drift out of sync.

   `force-static` opts this GET into caching — the content is constant
   per deploy, so there is no reason to recompute it per request. */
export const dynamic = "force-static";

/* Deliberately states the product is pre-release. An llms.txt that
   implies general availability would get quoted back to users as fact
   by the very assistants it is written for. */
const BODY = `# Brainfeather

> Long-term memory for AI coding agents. Brainfeather records the durable facts about your project — stack, conventions, decisions — and hands them back to your agent on its next run, so each session does not start from zero.

Brainfeather is a memory layer that sits beneath AI coding assistants such as
Claude Code, Cursor, opencode and Antigravity, and connects over the Model
Context Protocol (MCP). A language model's context window is RAM: fast, and
wiped when the session closes. Brainfeather is the disk beside it.

## Status

In early development. Not yet generally available — there is no public API,
SDK or installable package at the time of writing. Access is by waitlist.

## What it does

- Captures durable project facts in the background, off the critical path, so the session never waits on extraction.
- Retires stale facts rather than merely outranking them: change a decision and the previous one is marked invalid, so later reads return only what still holds.
- Filters conversational noise. Greetings and thinking-out-loud are not stored; tech choices, project rules and conventions are.
- Shares one store across every connected client, so a fact written from one tool is readable by the others on their next run.

## What it is not

- Not a general-purpose personalisation or user-profile platform. The focus is software projects and the agents working on them.
- Not a vector database. It is a memory layer with opinions about what is worth keeping.
- Not a replacement for your agent's context window — it is the durable store beside it.

## Pages

- [Home](${SITE_URL}/): what it is, how it works, and the waitlist.
- [Contact](${SITE_URL}/contact): support, early access, security reports, press.
- [Privacy Policy](${SITE_URL}/privacy): what is collected and stored, and for how long.
- [Terms of Service](${SITE_URL}/terms): the terms of use.

## Contact

${CONTACT_EMAIL}
`;

export async function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
