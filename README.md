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
