# Brainfeather

Marketing site for Brainfeather — long-term memory for AI coding agents.

## Stack

- Next.js 16.2 (App Router) · React 19 · TypeScript
- Tailwind CSS v4
- Deployed on Vercel

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

Open <http://localhost:3000>.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

## Routes

| Route | Notes |
| --- | --- |
| `/` | Landing page |
| `/privacy` | Privacy policy — **draft**, see Known gaps |
| `/terms` | Terms of service — **draft**, see Known gaps |
| `/contact` | Contact routes, each with a prefilled mailto subject |
| `/robots.txt`, `/sitemap.xml`, `/opengraph-image` | Generated metadata routes |

## Waitlist

The early-access form calls a Server Action (`src/app/actions.ts`) which forwards
the submission to a Google Apps Script Web App. That script appends a row to a
Google Sheet and emails the signup a confirmation.

Setup steps are in the header of `scripts/waitlist-sheet.gs`. Put the resulting
`/exec` URL in `WAITLIST_WEBHOOK_URL`. Until it is set, the form reports
"Sign-ups aren't live yet" rather than silently dropping addresses.

`.env.local` is gitignored and therefore **not** deployed, so
`WAITLIST_WEBHOOK_URL` must also be set in Vercel → Settings → Environment
Variables, or production collects nothing.

## Appwrite region

The endpoint host is region-specific and each region is an independent cluster,
so `NEXT_PUBLIC_APPWRITE_ENDPOINT` must match the region the project was created
in — a mismatch 404s every call. Bangalore is announced but not yet available;
Singapore (`https://sgp.cloud.appwrite.io/v1`) is the closest live region to
India.

## API key storage rollout

Editor keys are managed through JWT-authenticated server routes and can be stored as
SHA-256 digests. Roll out without breaking active editors:

1. Add a unique index on `api_keys.key` and deploy with
   `BRAINFEATHER_API_KEY_STORAGE=compatibility`. This reads both formats but leaves
   existing rows and new writes in plaintext, making the release rollback-safe.
2. Verify dashboard JWT access and existing editor keys.
3. Set `BRAINFEATHER_API_KEY_STORAGE=hashed`, redeploy the same code, and open Settings
   once per account (or run an admin migration) to hash legacy rows.
4. Confirm no plaintext rows remain before removing the compatibility lookup in a later
   release.

## User data encryption rollout

Memory text, titles, private metadata, project identifiers, entity names, and entity
summaries support application-layer AES-256-GCM encryption. Appwrite stores ciphertext
and tenant-bound blind indexes; authenticated server routes decrypt values for the MCP
and dashboard. This protects database exports and console access, but it is not
zero-knowledge encryption: a production operator with both database access and the
Vercel encryption keys can decrypt data.

Use three rollout states:

1. Increase Appwrite string capacities before deploying encrypted writes:
   `memories.content=11000`, `memories.title=1024`, `memories.metadata=3000`, and
   `entities.summary=3000`.
2. Generate two independent 32-byte secrets. Set
   `BRAINFEATHER_DATA_ENCRYPTION_KEYS=v1:<base64url-key>`,
   `BRAINFEATHER_DATA_INDEX_KEY=<base64url-key>`, and
   `BRAINFEATHER_DATA_ENCRYPTION=compatibility`. Compatibility mode reads plaintext and
   ciphertext, queries plaintext and blind indexes, and keeps new rows plaintext.
3. Verify dashboard and MCP reads, then switch to
   `BRAINFEATHER_DATA_ENCRYPTION=encrypted`. New writes are encrypted.
4. While signed into the dashboard, `POST /api/v1/account/encryption` with the dashboard
   JWT once per account. The idempotent migration encrypts active and superseded memories
   plus derived entities and returns counts only.
5. Verify every private field is an envelope beginning with `bfe1.` and every indexed
   private identifier is a 64-character blind index. Keep compatibility mode available
   for rollback; plaintext mode intentionally refuses encrypted rows.

For key rotation, prepend the new key (`v2:<new>,v1:<old>`) and run the same account
migration. Remove `v1` only after no `bfe1.v1.` values remain. Rotating the blind-index
key requires a separate coordinated index migration and must not be done in place.

## Retrieval evaluation

Encrypted memory search ranks tenant- and project-scoped candidates only after they are
decrypted inside the server process. Ranking combines BM25 lexical relevance, curated
related concepts, canonical entity overlap, and bounded recency. Queries and plaintext
candidate text are not sent to an external search or embedding provider.

Run the deterministic regression suite with:

```bash
npm run eval:retrieval
```

The report compares the previous concept-only ranker with the hybrid ranker using MRR,
Hit@1, Hit@3, negative-query abstention, and in-process latency. This small fixture suite
is a release regression gate, not a substitute for LoCoMo, LongMemEval, BEAM, or a claim
of benchmark parity with other memory systems.

## Known gaps

- **The legal pages are drafts.** Both carry a visible banner and highlighted
  `[placeholders]` for values only the operator can supply — legal entity,
  registered address, retention window, governing law, liability cap. They are
  drafted around a UK/EU framing and need review against the actual operating
  jurisdiction before publication.
- **The confirmation email has never been executed.** It needs one real signup
  against a deployed Apps Script to verify.
- The favicon is still the `create-next-app` default.

## Licence

Proprietary — copyright © 2026 Brainfeather, all rights reserved. This is **not**
open-source software. The repository being readable does not grant any right to
use, copy, modify, or redistribute its contents. See [LICENSE](LICENSE).
