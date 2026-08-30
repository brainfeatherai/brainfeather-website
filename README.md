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
| `npm run schema:migrate` | Idempotently prepare Appwrite enums, encrypted field sizes and server tables |
| `npm run schema:verify` | Verify Appwrite collections, tables, fields, enums and indexes |

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

## Waitlist email notifications

New waitlist requests are saved before email delivery begins. A newly created request sends
an owner notification to `getbrainfeather@gmail.com` and a branded confirmation to the
applicant. Duplicate submissions do not resend either message.

The owner notification contains a signed, expiring review link. Opening it only displays the
request; approval requires a separate confirmation POST. Approval updates the Appwrite row and
sends the applicant a direct `/login?invite=...` account link. Google sign-in remains
invite-only because the callback verifies the authenticated email against the approved
waitlist before allowing console access.

Enable delivery by turning on two-step verification for `getbrainfeather@gmail.com`, creating
a Google app password, and setting `GMAIL_APP_PASSWORD` in Vercel for Production, Preview, and
Development. Use the 16-character app password, not the Gmail account password. Redeploy after
adding or rotating it. SMTP failures are reported to Sentry and never discard the Appwrite row.

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

Production startup fails closed unless data encryption is `encrypted`, API key storage
is `hashed`, and dedicated data-index and session-signing secrets are configured. Run
`npm run schema:verify` before deployment; it reports every missing collection, table,
field, enum value, capacity and query index without mutating Appwrite.
`BRAINFEATHER_RATE_LIMIT_SECRET` must also be a dedicated 32+ character secret; public
waitlist throttling stores only an HMAC bucket, never the raw network address.

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

Encrypted memory search ranks tenant- and repository-scoped candidates only after they
are decrypted inside the server process. Optional `branch` and `taskId` overlays are
stored in encrypted metadata: repository facts are inherited, branch facts stay on their
branch, and task facts stay with their task. A task can optionally be constrained to a
branch. Ranking combines BM25 lexical relevance, curated related concepts, canonical
entity overlap, and bounded recency. Queries and plaintext candidate text are not sent
to an external search or embedding provider.

Run the deterministic regression suite with:

```bash
npm run eval:retrieval
```

RepoMemBench extends that retrieval smoke test into a coding-memory baseline covering
scope isolation, stale truth, write filtering, supersession, evidence, context budgets,
and latency:

```bash
npm run bench:repo-memory
```

See [`docs/repomembench.md`](docs/repomembench.md) for scenarios, metrics, known gaps,
and the future Mem0/Zep comparison protocol.

The report compares the previous concept-only ranker with the hybrid ranker using MRR,
Hit@1, Hit@3, negative-query abstention, and in-process latency. This small fixture suite
is a release regression gate, not a substitute for LoCoMo, LongMemEval, BEAM, or a claim
of benchmark parity with other memory systems.

## Temporal memory and context budgets

New memories carry compact encrypted temporal metadata: when Brainfeather observed the
fact, when it was valid, its temporal type, confidence, and evidence provenance. The
`referenceAt` query parameter on memory lists, search, and context returns facts valid at
that point in time. Existing rows remain readable; legacy invalid rows without a reliable
validity end fail closed in historical queries.

Memory list, search, context, capture, session, consolidation, entity, and graph APIs
accept optional `branch` and `taskId` scope values alongside `projectId`. Hosted MCP tools
accept `branch` and `taskId` per call; the repository remains bound to the MCP connection.

`GET /api/v1/context` also accepts an optional `query` and `maxTokens` (256–12,000).
The context compiler pins the top relevant memory, preserves facts/decisions/patterns
diversity when budget allows, and never truncates individual memories.

Historical reads use the validity interval recorded in encrypted metadata and all evidence
currently known to Brainfeather. `observedAt` remains separate, so a fact learned later can
still describe an earlier period without pretending Brainfeather knew it at that time.
Historical evidence can be stored and recalled without invalidating or enriching current
project truth. Future-effective activation is rejected until a scheduler exists; this
prevents status and graph edges from changing before the fact is valid.

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
