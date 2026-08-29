/* ────────────────────────────────────────────────────────────────
   Entity recognition.

   NO `server-only` guard here, unlike its siblings in this folder. That
   guard exists to keep the Appwrite admin key out of client bundles;
   this module is pure string processing with no credentials and no
   database access, so the guard would buy nothing and would make the
   logic untestable outside a server runtime.

   Replaces a single-token lookup that failed on the spellings people
   actually use. The old tokenizer split on /[^a-z0-9]+/ and matched
   whole words against a flat map, so:

     "We use Next.js"  ->  []          (split to ["next","js"], neither a key)
     "We use nextjs"   ->  [nextjs]
     "Node.js", "Vue.js", "socket.io"  ->  all invisible

   Any name containing a dot could never match, which is most JS
   frameworks as normally written. Two changes fix it:

   1. ALIASES maps every surface form to one canonical name, so
      "TS", "typescript" and "Typescript" converge instead of forking.

   2. Matching considers adjacent token PAIRS as well as single tokens.
      "Next.js" tokenizes to ["next","js"], whose joined bigram "nextjs"
      resolves. Same mechanism covers "node js" and "socket io".

   AMBIGUOUS handles the opposite failure. "go", "rust" and "next" are
   ordinary English words, and a bare match on them produced entities
   from "go ahead" or "the next step". Those require a nearby technical
   cue before they count.
   ──────────────────────────────────────────────────────────────── */

export type EntityType = 'tool' | 'language' | 'concept' | 'person' | 'project' | 'pattern';

/** canonical name -> type */
const CANONICAL = new Map<string, EntityType>([
  // package managers / runtimes
  ['pnpm', 'tool'], ['npm', 'tool'], ['yarn', 'tool'], ['bun', 'tool'],
  ['nodejs', 'tool'], ['deno', 'tool'],
  // languages
  ['typescript', 'language'], ['javascript', 'language'], ['python', 'language'],
  ['rust', 'language'], ['go', 'language'], ['ruby', 'language'], ['java', 'language'],
  ['kotlin', 'language'], ['swift', 'language'], ['php', 'language'], ['elixir', 'language'],
  // frameworks
  ['react', 'tool'], ['nextjs', 'tool'], ['vue', 'tool'], ['svelte', 'tool'],
  ['angular', 'tool'], ['solid', 'tool'], ['astro', 'tool'], ['remix', 'tool'],
  ['express', 'tool'], ['fastify', 'tool'], ['hono', 'tool'], ['nestjs', 'tool'],
  ['django', 'tool'], ['flask', 'tool'], ['fastapi', 'tool'], ['rails', 'tool'],
  ['laravel', 'tool'], ['spring', 'tool'],
  // testing
  ['vitest', 'tool'], ['jest', 'tool'], ['pytest', 'tool'], ['playwright', 'tool'],
  ['cypress', 'tool'], ['mocha', 'tool'], ['rspec', 'tool'],
  // data
  ['postgres', 'tool'], ['mysql', 'tool'], ['sqlite', 'tool'], ['mongodb', 'tool'],
  ['redis', 'tool'], ['supabase', 'tool'], ['appwrite', 'tool'], ['firebase', 'tool'],
  ['prisma', 'tool'], ['drizzle', 'tool'], ['knex', 'tool'], ['sequelize', 'tool'],
  ['clickhouse', 'tool'], ['elasticsearch', 'tool'],
  // build
  ['vite', 'tool'], ['webpack', 'tool'], ['esbuild', 'tool'], ['rollup', 'tool'],
  ['turborepo', 'tool'], ['nx', 'tool'], ['babel', 'tool'],
  // Apple development
  ['xcode', 'tool'], ['swiftui', 'tool'], ['uikit', 'tool'],
  ['cocoapods', 'tool'],
  // infra
  ['docker', 'tool'], ['kubernetes', 'tool'], ['terraform', 'tool'],
  ['vercel', 'tool'], ['netlify', 'tool'], ['cloudflare', 'tool'],
  ['aws', 'tool'], ['gcp', 'tool'], ['azure', 'tool'], ['fly', 'tool'], ['railway', 'tool'],
  // ai
  ['openai', 'tool'], ['anthropic', 'tool'], ['ollama', 'tool'],
  ['langchain', 'tool'], ['pinecone', 'tool'],
  // styling
  ['tailwind', 'tool'], ['sass', 'tool'], ['styledcomponents', 'tool'],
  // practice
  ['tdd', 'concept'], ['ci', 'concept'], ['monorepo', 'concept'],
  ['microservices', 'concept'], ['graphql', 'concept'], ['rest', 'concept'],
  ['oauth', 'concept'], ['jwt', 'concept'], ['websockets', 'concept'],
]);

/** surface form -> canonical. Keys are compared lowercased and stripped. */
const ALIASES = new Map<string, string>([
  ['ts', 'typescript'], ['js', 'javascript'], ['py', 'python'],
  ['golang', 'go'], ['rs', 'rust'],
  ['reactjs', 'react'],
  ['next', 'nextjs'], ['nextjs', 'nextjs'],
  ['node', 'nodejs'], ['nodejs', 'nodejs'],
  ['vuejs', 'vue'], ['nuxt', 'vue'],
  ['nest', 'nestjs'],
  ['postgresql', 'postgres'], ['pg', 'postgres'],
  ['mongo', 'mongodb'],
  ['k8s', 'kubernetes'], ['k8', 'kubernetes'],
  ['turbo', 'turborepo'],
  ['tailwindcss', 'tailwind'],
  ['xcode', 'xcode'], ['xcodeproj', 'xcode'],
  ['swiftui', 'swiftui'], ['uikit', 'uikit'],
  ['cocoapods', 'cocoapods'],
  ['gpt', 'openai'], ['chatgpt', 'openai'], ['claude', 'anthropic'],
  ['cf', 'cloudflare'], ['workers', 'cloudflare'],
  ['amazon', 'aws'],
  ['continuousintegration', 'ci'],
  ['testdrivendevelopment', 'tdd'],
]);

/* Real words before they are technology names. A bare occurrence is
   ignored; one near a technical cue counts. Without this, "go ahead and
   fix it" recorded Go as a project language. */
const AMBIGUOUS = new Set(['go', 'rust', 'next', 'solid', 'spring', 'fly', 'rest', 'java', 'nx', 'ci', 'node']);

/* Cues that make an ambiguous term a technology reference. Kept short —
   every entry is a phrase that only precedes or follows a tech noun. */
const TECH_CUE = /\b(use[sd]?|using|written in|built (?:in|with)|migrat\w+ to|switch\w* to|rewrit\w+ in|port\w* to|stack|backend|frontend|runtime|framework|language|server|api|deploy\w*|prefer|standard|convention)\b/i;

/* Dynamic names are accepted only behind explicit labels. Guessing from
   capitalization made ordinary prose into people and projects; these
   forms require the author to say what the name represents. */
const NAMED_PROJECT = [
  /\bproject\s*(?::|=|named\s+|called\s+)\s*["'`]([^"'`\n]{2,80})["'`]/gi,
  /\bproject\s*(?::|=|named\s+|called\s+)\s*([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9_-]+)*(?:\s+[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9_-]+)*){0,3}?)(?=\s+(?:uses?|is|has|runs?|depends?|deploys?|with|on|for)\b|[,.!;:]|$)/gi,
  /\bproject\s+([A-Z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*(?:\s+[A-Z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*){0,2})(?=\s+(?:uses?|is|has|runs?|depends?|deploys?|with|on|for)\b|[,.!;:]|$)/g,
  /\b((?:The\s+)?[A-Z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*(?:\s+[A-Z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*){0,2})\s+project\b/g,
];

const NAMED_REPOSITORY = [
  /https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/gi,
  /\b(?:repo|repository)\s*(?::|=|named\s+|called\s+)?\s*["'`]?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)["'`]?/gi,
  /\b(?:repo|repository)\s*(?::|=|named\s+|called\s+)\s*["'`]([^"'`\n]{2,80})["'`]/gi,
  /\b(?:repo|repository)\s*(?::|=|named\s+|called\s+)\s*([A-Za-z0-9][A-Za-z0-9._-]{1,79})/gi,
];

const NAMED_PERSON = [
  /\b(?:person|maintainer|tech\s+lead|project\s+lead|contact)\s*(?::|=|named\s+|called\s+)\s*["'`]([^"'`\n]{2,80})["'`]/gi,
  /\b(?:person|maintainer|tech\s+lead|project\s+lead|contact)\s*(?::|=|named\s+|called\s+)\s*(@[A-Za-z0-9_-]{2,39}|[A-Z][A-Za-z'’-]*(?:\s+[A-Z][A-Za-z'’-]*){0,3})/gi,
];

const KNOWN_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'event sourcing', pattern: /\bevent[- ]sourcing\b/i },
  { name: 'cqrs', pattern: /\bcqrs\b/i },
  { name: 'model view controller', pattern: /\b(?:model[- ]view[- ]controller|mvc)\b/i },
  { name: 'clean architecture', pattern: /\bclean architecture\b/i },
  { name: 'hexagonal architecture', pattern: /\b(?:hexagonal architecture|ports and adapters)\b/i },
  { name: 'repository pattern', pattern: /\brepository pattern\b/i },
  { name: 'unit of work', pattern: /\bunit of work\b/i },
  { name: 'domain driven design', pattern: /\b(?:domain[- ]driven design|ddd)\b/i },
  { name: 'event driven architecture', pattern: /\bevent[- ]driven architecture\b/i },
  { name: 'microservices architecture', pattern: /\bmicroservices architecture\b/i },
  { name: 'circuit breaker', pattern: /\bcircuit breaker(?: pattern)?\b/i },
  { name: 'transactional outbox', pattern: /\b(?:transactional )?outbox pattern\b/i },
  { name: 'saga pattern', pattern: /\bsaga pattern\b/i },
  { name: 'publish subscribe', pattern: /\b(?:publish[- ]subscribe|pub\/sub)\b/i },
];

const INVALID_DYNAMIC_NAMES = new Set([
  'a',
  'an',
  'none',
  'our',
  'the',
  'this',
  'unknown',
]);

function normalizeDynamicName(raw: string, type: EntityType): string | null {
  let name = raw
    .trim()
    .replace(/^(?:the|our)\s+/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  /* GitHub URLs can leave punctuation at the end of a repository slug. */
  name = name.replace(/[.,;:!?]+$/, '').replace(/\.git$/i, '');
  if (name.length < 2 || name.length > 100 || INVALID_DYNAMIC_NAMES.has(name)) return null;
  if (type === 'person' && !/^@?[a-z][a-z'’ _-]*$/i.test(name)) return null;
  if ((type === 'project' || type === 'person') && /^(?:uses?|is|has|with|on|for)$/.test(name)) {
    return null;
  }
  return name;
}

function collectNamed(
  content: string,
  patterns: RegExp[],
  type: EntityType,
  keep: (hit: { name: string; type: EntityType }) => void,
): void {
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const name = normalizeDynamicName(match[1], type);
      if (name) keep({ name, type });
    }
  }
}

/** Resolve one surface form to its canonical name, or null. */
function resolve(
  raw: string,
  hasCue: boolean,
): { name: string; type: EntityType } | null {
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return null;

  /* Ambiguity is a property of the SURFACE form, not of the canonical
     name it maps to. "next" is ordinary English and needs corroboration;
     "nextjs" written out is unambiguous and does not. Same for
     "go" versus "golang".

     Checking the canonical name instead was a real bug: AMBIGUOUS holds
     `next`, the canonical is `nextjs`, so the guard never fired and
     "The next step is unclear" recorded Next.js. */
  if (AMBIGUOUS.has(key) && !hasCue) return null;

  const name = ALIASES.get(key) ?? key;
  const type = CANONICAL.get(name);
  return type ? { name, type } : null;
}

export function extractEntities(content: string): { name: string; type: EntityType }[] {
  const words = content.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  const found = new Map<string, EntityType>();
  const keep = (hit: { name: string; type: EntityType }) => {
    if (!found.has(hit.name)) found.set(hit.name, hit.type);
  };

  for (let i = 0; i < words.length; i++) {
    /* Ambiguous words need a LOCAL technical cue. A whole-memory cue made
       "uses React and the next step" invent Next.js; a seven-word window
       still sees "written in Go" without leaking across clauses. */
    const hasCue = TECH_CUE.test(
      words.slice(Math.max(0, i - 3), Math.min(words.length, i + 3)).join(' '),
    );
    /* Longest match wins. A bigram that resolves CONSUMES both tokens,
       so "Next.js" -> ["next","js"] yields nextjs and nothing else.
       Considering the unigram as well left the trailing "js" free to
       match JavaScript, inventing a second entity from one name. */
    if (i + 1 < words.length) {
      const pair = resolve(words[i] + words[i + 1], hasCue);
      if (pair) {
        keep(pair);
        i++;
        continue;
      }
    }

    const single = resolve(words[i], hasCue);
    if (single) keep(single);
  }

  collectNamed(content, NAMED_PROJECT, 'project', keep);
  collectNamed(content, NAMED_REPOSITORY, 'project', keep);
  collectNamed(content, NAMED_PERSON, 'person', keep);
  for (const entry of KNOWN_PATTERNS) {
    if (entry.pattern.test(content)) keep({ name: entry.name, type: 'pattern' });
  }

  return [...found].map(([name, type]) => ({ name, type }));
}

/* ────────────────────────────────────────────────────────────────
   Surprise weighting.

   From HiMem (arxiv:2601.06377): a fact that conflicts with what is
   already known carries more information than one restating it, and is
   worth storing more eagerly.

   Used to modulate the junk threshold — a borderline line that
   contradicts an existing fact is kept, where the same line in
   isolation would be dropped. A correction is the case that matters:
   "actually no, Postgres" is short and low-signal on its own, and is
   the single most important thing to record.
   ──────────────────────────────────────────────────────────────── */

export function surpriseScore(content: string, existing: string[]): number {
  if (!existing.length) return 0.5;

  const t = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const incoming = t(content);

  let peak = 0;
  for (const prior of existing) {
    const other = t(prior);
    let shared = 0;
    for (const w of incoming) if (other.has(w)) shared++;
    const overlap = shared / (incoming.size + other.size - shared || 1);
    /* Peak overlap in the 0.4-0.85 band is the interesting signal: same
       subject, different claim. Identical text is a duplicate and is
       caught earlier; unrelated text is simply new. */
    if (overlap > 0.4 && overlap < 0.85) peak = Math.max(peak, overlap);
  }
  return peak;
}
