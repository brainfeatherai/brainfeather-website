import 'server-only';

/* ────────────────────────────────────────────────────────────────
   Admin Appwrite client — server only.

   The `server-only` import above is load-bearing. This module holds
   APPWRITE_API_KEY, a full-scope credential that can read, write and
   delete every collection for every user. If it ever reached a client
   bundle it would be readable by anyone who opened devtools. That
   import makes importing this file from a client component a BUILD
   error rather than a silent leak.

   This is the whole point of the API layer: the admin key lives here,
   on the server, and the MCP server never sees it. Callers authenticate
   with a revocable bf_live_ token instead.

   Uses `node-appwrite` (server SDK), NOT `appwrite` (web SDK). The two
   have different constructors — only the server one accepts .setKey().
   ──────────────────────────────────────────────────────────────── */

import { Client, Databases, TablesDB, Users } from 'node-appwrite';

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !project || !apiKey) {
  /* Fail at import rather than at first query. A missing key here means
     every route 500s on its first request with an opaque Appwrite error;
     this names the actual problem. */
  throw new Error(
    '[brainfeather] Missing NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID or APPWRITE_API_KEY.',
  );
}

export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ?? 'brainfeather';

/* The database ID is NOT the project ID. Conflating them is exactly the
   bug that made every MCP server read and write target a database that
   did not exist. */
export const COLLECTIONS = {
  users: 'users',
  memories: 'memories',
  entities: 'entities',
  edges: 'edges',
  apiKeys: 'api_keys',
  apiRequests: 'api_requests',
  contextRules: 'context_rules',
  teams: 'teams',
  teamMembers: 'team_members',
  decisions: 'decisions',
  patterns: 'patterns',
  waitlist: 'waitlist',
} as const;

const adminClient = new Client().setEndpoint(endpoint).setProject(project).setKey(apiKey);

export const adminDb = new Databases(adminClient);
export const adminTables = new TablesDB(adminClient);
export const adminUsers = new Users(adminClient);
