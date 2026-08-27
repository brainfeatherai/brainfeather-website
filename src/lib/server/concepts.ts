/* ────────────────────────────────────────────────────────────────
   Query expansion over a domain concept graph.

   The problem this solves, concretely: searching "how do we handle auth"
   returned NOTHING for a stored fact reading "Supabase RLS for
   permissions". Zero shared tokens, so substring matching finds zero
   rows — while the answer sits right there.

   Mem0 and Zep solve this with embeddings, paying an API call and
   ~100-300ms on every query. That is the right tool for open-domain
   text. This domain is not open: it is tools, frameworks, and
   engineering concepts, a vocabulary of a few hundred terms that barely
   shifts. A curated graph covers most real queries deterministically,
   costs nothing, adds no latency, and needs no provider key.

   NOT a replacement for embeddings in every case. It cannot generalise
   to a term nobody listed. The `expand` signature is deliberately shaped
   so a vector recall step can be fused in later without touching
   callers — see the note on RELATED_WEIGHT.
   ──────────────────────────────────────────────────────────────── */

/* Each cluster is a set of terms that a developer would consider
   interchangeable when SEARCHING, which is looser than being synonyms.
   Someone asking about "auth" wants the RLS fact, the JWT fact and the
   session fact — they are not the same thing, but they answer the same
   question.

   Deliberately NOT transitive across clusters. `auth` reaches `rls`, and
   `rls` reaches `postgres` through the database cluster, but expanding
   `auth` must not drag in every Postgres fact. Expansion is one hop. */
const CLUSTERS: readonly (readonly string[])[] = [
  // identity
  ['auth', 'authentication', 'authorization', 'login', 'signin', 'signup',
   'session', 'jwt', 'oauth', 'sso', 'rls', 'permissions', 'roles', 'identity',
   'credentials', 'password', 'token'],
  // storage
  ['database', 'db', 'postgres', 'postgresql', 'mysql', 'sqlite', 'mongodb',
   'redis', 'supabase', 'appwrite', 'firebase', 'schema', 'migration',
   'table', 'collection', 'query', 'sql'],
  // data access — 'query' and 'data' are listed here AND in storage on
  // purpose. SIBLINGS accumulates across clusters, so "how do we query
  // data" reaches both the ORM facts and the database facts, which is
  // what someone asking that actually wants.
  ['orm', 'prisma', 'drizzle', 'sequelize', 'knex', 'repository',
   'dao', 'model', 'entity', 'query', 'queries', 'data'],
  // testing
  ['test', 'tests', 'testing', 'vitest', 'jest', 'pytest', 'mocha', 'rspec',
   'playwright', 'cypress', 'e2e', 'unit', 'integration', 'coverage',
   'mock', 'fixture', 'assertion', 'tdd'],
  // shipping — 'ship' included because it is how developers actually say
  // this; a query for "where does it ship" found nothing without it.
  ['deploy', 'deployment', 'ship', 'shipping', 'hosting', 'vercel', 'netlify',
   'cloudflare', 'aws', 'gcp', 'azure', 'fly', 'railway', 'docker',
   'kubernetes', 'k8s', 'ci', 'cd', 'pipeline', 'build', 'release',
   'staging', 'production'],
  // interface
  ['frontend', 'ui', 'react', 'vue', 'svelte', 'angular', 'nextjs',
   'component', 'styling', 'css', 'tailwind', 'sass', 'design', 'layout'],
  // service side
  ['backend', 'api', 'server', 'endpoint', 'route', 'handler', 'rest',
   'graphql', 'rpc', 'grpc', 'webhook', 'middleware'],
  // language
  ['typescript', 'ts', 'javascript', 'js', 'python', 'rust', 'go', 'golang',
   'java', 'kotlin', 'swift', 'ruby', 'php', 'types', 'typing'],
  // packaging
  ['package', 'dependency', 'dependencies', 'npm', 'pnpm', 'yarn', 'bun',
   'monorepo', 'workspace', 'turborepo', 'lockfile', 'registry'],
  // tooling
  ['bundler', 'vite', 'webpack', 'esbuild', 'rollup', 'compiler', 'babel',
   'transpile', 'lint', 'eslint', 'prettier', 'format'],
  // conventions
  ['convention', 'style', 'pattern', 'standard', 'guideline', 'rule',
   'practice', 'preference', 'structure', 'naming', 'architecture'],
  // errors
  ['error', 'errors', 'exception', 'failure', 'bug', 'crash', 'logging',
   'monitoring', 'observability', 'tracing', 'debug', 'retry', 'timeout'],
  // performance
  ['performance', 'latency', 'slow', 'speed', 'optimization', 'cache',
   'caching', 'memoize', 'throughput', 'scale', 'scaling'],
  // ai
  ['llm', 'ai', 'model', 'openai', 'anthropic', 'claude', 'gpt', 'ollama',
   'embedding', 'embeddings', 'vector', 'prompt', 'agent', 'rag'],
];

/** term -> every sibling term, precomputed once at module load. */
const SIBLINGS = new Map<string, Set<string>>();
for (const cluster of CLUSTERS) {
  for (const term of cluster) {
    let set = SIBLINGS.get(term);
    if (!set) SIBLINGS.set(term, (set = new Set()));
    /* A term appearing in two clusters accumulates both — "model" is
       both an ORM concept and an AI one, and a search for it should
       reach either. */
    for (const sibling of cluster) if (sibling !== term) set.add(sibling);
  }
}

/* Morphological variants, so "deploying" and "deployment" reach the
   `deploy` cluster. A stemmer would be heavier and less predictable
   than stripping four suffixes. */
const SUFFIXES = ['ing', 'ed', 'es', 's'];

function normalize(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SIBLINGS.has(w)) return w;
  for (const suffix of SUFFIXES) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (SIBLINGS.has(stem)) return stem;
    }
  }
  return w;
}

/* Words that match everything and therefore rank nothing. Dropped from
   the query before expansion — without this, "how do we handle auth"
   scores every fact containing "do" or "we". */
const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'is', 'are', 'was',
  'were', 'be', 'been', 'do', 'does', 'did', 'how', 'what', 'which', 'who',
  'when', 'where', 'why', 'we', 'i', 'you', 'they', 'it', 'this', 'that',
  'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'about',
  'our', 'my', 'use', 'using', 'used', 'handle', 'handling', 'get', 'set',
]);

export type ExpandedQuery = {
  /** Terms the user actually typed. Full weight. */
  exact: string[];
  /** One-hop siblings. Partial weight — see RELATED_WEIGHT. */
  related: string[];
};

/* A related-term hit is worth less than an exact one, so a fact that
   literally says "auth" still outranks one that only says "RLS". Set to
   0.35 rather than 0.5 deliberately: expansion should surface a fact
   that would otherwise be invisible, never reorder good direct matches.

   When embeddings arrive, cosine similarity becomes a third signal
   fused at this same weighting layer — which is why scoring lives here
   rather than inline in the store. */
export const RELATED_WEIGHT = 0.35;

/* Ceiling on the combined related contribution, as a fraction of what
   ONE exact term is worth. Below 1.0, so no pile of related terms can
   ever outrank a document that matched an exact term the other did not.

   Without a cap, related hits accumulated linearly and a document
   stuffed with cluster vocabulary scored 3.45 against a literal match's
   1.00 — burying the better answer. */
const RELATED_CEILING = 0.9;

const MAX_QUERY_TERMS = 32;

/** Search tokens shared by lexical ranking and concept expansion. */
export function searchTokens(text: string, limit = 2048): string[] {
  const tokens: string[] = [];
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    const term = normalize(word);
    if (STOP.has(term) || (term.length < 3 && !SIBLINGS.has(term))) continue;
    tokens.push(term);
    if (tokens.length >= limit) break;
  }
  return tokens;
}

export function expand(query: string): ExpandedQuery {
  const exact = new Set<string>();
  for (const term of searchTokens(query, MAX_QUERY_TERMS * 2)) {
    exact.add(term);
    if (exact.size >= MAX_QUERY_TERMS) break;
  }

  const related = new Set<string>();
  for (const term of exact) {
    for (const sibling of SIBLINGS.get(term) ?? []) {
      if (!exact.has(sibling)) related.add(sibling);
    }
  }

  return { exact: [...exact], related: [...related] };
}

/* Does `term` occur in `haystack` at the START of a word?

   PREFIX-anchored, not plain substring and not whole-word. Plain
   `includes` was wrong in a way that broke ranking: "oauth" contains
   "auth", so a document mentioning OAuth scored a full exact hit for the
   query "auth" and outranked one that said "auth" outright.

   Whole-word would be wrong in the other direction — "deploy" must
   still reach "deployment", or the suffix list would have to be
   exhaustive on the document side too. Anchoring the start and leaving
   the end open gets both: `deploy` matches `deployment`, `auth` does not
   match `oauth`.

   Hand-rolled rather than a RegExp because this runs for every term
   against every candidate document; this allocates nothing. */
function mentions(haystack: string, term: string): boolean {
  for (let from = 0; ; ) {
    const at = haystack.indexOf(term, from);
    if (at === -1) return false;
    if (at === 0 || !/[a-z0-9]/.test(haystack[at - 1])) return true;
    from = at + 1;
  }
}

function hitCounts(text: string, q: ExpandedQuery): {
  exactHits: number;
  relatedHits: number;
} {
  const haystack = text.toLowerCase();
  let exactHits = 0;
  for (const term of q.exact) if (mentions(haystack, term)) exactHits += 1;

  let relatedRaw = 0;
  for (const term of q.related) if (mentions(haystack, term)) relatedRaw += RELATED_WEIGHT;
  return { exactHits, relatedHits: Math.min(relatedRaw, RELATED_CEILING) };
}

/** Independent bounded concept signal for hybrid rank fusion. */
export function conceptRelatedScore(text: string, q: ExpandedQuery): number {
  if (!q.exact.length || !q.related.length) return 0;
  return hitCounts(text, q).relatedHits / RELATED_CEILING;
}

/* Relevance for one document against an expanded query.

   Normalised by exact-term count, so a two-word query and a five-word
   query produce comparable scores — otherwise a longer query inflates
   every result and the caller's threshold stops meaning anything. */
export function score(text: string, q: ExpandedQuery): number {
  if (!q.exact.length) return 0;
  const { exactHits, relatedHits } = hitCounts(text, q);
  return (exactHits + relatedHits) / q.exact.length;
}
