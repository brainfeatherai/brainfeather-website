import { Client, Databases, TablesDB, type Models } from 'node-appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ?? 'brainfeather';
const SOURCES = [
  'manual',
  'chatgpt',
  'claude',
  'cursor',
  'slack',
  'chrome',
  'opencode',
  'codex',
  'antigravity',
];
const CATEGORIES = ['preference', 'context', 'decision', 'code', 'project', 'team'];

type Field = {
  key: string;
  type?: string;
  minSize?: number;
  required?: boolean;
  array?: boolean;
  elements?: string[];
};

type Resource = {
  id: string;
  fields: Field[];
  indexes?: { columns: string[]; type?: string }[];
};

const collections: Resource[] = [
  {
    id: 'users',
    fields: [
      { key: 'email', type: 'string' },
      { key: 'name', type: 'string' },
      { key: 'plan', type: 'string', required: true },
      { key: 'memoriesCount', type: 'integer' },
      { key: 'lastActiveAt', type: 'string' },
    ],
  },
  {
    id: 'memories',
    fields: [
      { key: 'userId', type: 'string', minSize: 64, required: true },
      { key: 'source', type: 'enum', required: true, elements: SOURCES },
      { key: 'title', type: 'string', minSize: 1024 },
      { key: 'content', type: 'string', minSize: 11000, required: true },
      { key: 'category', type: 'enum', required: true, elements: CATEGORIES },
      { key: 'tags', type: 'string', array: true },
      { key: 'status', type: 'enum', required: true, elements: ['active', 'invalid'] },
      { key: 'supersededBy', type: 'string', minSize: 64 },
      { key: 'projectId', type: 'string', minSize: 64 },
      { key: 'metadata', type: 'string', minSize: 4096 },
    ],
    indexes: [
      { columns: ['userId', 'status'] },
      { columns: ['userId', 'projectId'] },
      { columns: ['userId', 'category'] },
    ],
  },
  {
    id: 'entities',
    fields: [
      { key: 'userId', type: 'string', minSize: 64, required: true },
      { key: 'name', type: 'string', minSize: 64, required: true },
      { key: 'type', type: 'enum', required: true },
      { key: 'summary', type: 'string', minSize: 3000 },
      { key: 'metadata', type: 'string', minSize: 3000 },
    ],
    indexes: [{ columns: ['userId', 'name'] }, { columns: ['userId', 'type'] }],
  },
  {
    id: 'edges',
    fields: [
      { key: 'userId', type: 'string', minSize: 64, required: true },
      { key: 'sourceId', type: 'string', minSize: 64, required: true },
      { key: 'targetId', type: 'string', minSize: 64, required: true },
      { key: 'type', type: 'enum', required: true },
      { key: 'weight', type: 'integer' },
      { key: 'validFrom', type: 'string' },
      { key: 'validTo', type: 'string' },
    ],
    indexes: [{ columns: ['userId', 'sourceId'] }, { columns: ['userId', 'targetId'] }],
  },
  {
    id: 'api_keys',
    fields: [
      { key: 'userId', type: 'string', minSize: 64, required: true },
      { key: 'name', type: 'string', required: true },
      { key: 'key', type: 'string', minSize: 90, required: true },
      { key: 'lastUsedAt', type: 'string' },
    ],
    indexes: [{ columns: ['userId'] }, { columns: ['key'], type: 'unique' }],
  },
];

const tables: Resource[] = [
  {
    id: 'memory_candidates',
    fields: [
      { key: 'userId', type: 'string', minSize: 64, required: true },
      { key: 'sessionId', type: 'string', minSize: 256 },
      { key: 'source', type: 'enum', required: true, elements: SOURCES },
      { key: 'category', type: 'enum', required: true, elements: CATEGORIES },
      { key: 'content', type: 'string', minSize: 4000, required: true },
      { key: 'title', type: 'string', minSize: 256 },
      { key: 'projectId', type: 'string', minSize: 256 },
      { key: 'provenance', type: 'string', minSize: 768 },
      { key: 'confidence', type: 'float', required: true },
      { key: 'status', type: 'enum', required: true, elements: ['pending', 'approved', 'rejected'] },
      { key: 'reviewedAt', type: 'datetime' },
      { key: 'decision', type: 'string', minSize: 1500 },
    ],
    indexes: [{ columns: ['userId', 'status'] }],
  },
  {
    id: 'api_requests',
    fields: [
      { key: 'userId', type: 'string', minSize: 64, required: true },
      { key: 'keyId', type: 'string', minSize: 64, required: true },
      { key: 'operation', type: 'string', minSize: 64, required: true },
      { key: 'method', type: 'string', minSize: 16, required: true },
      { key: 'status', type: 'integer', required: true },
      { key: 'durationMs', type: 'integer', required: true },
      { key: 'occurredAt', type: 'datetime', required: true },
    ],
    indexes: [{ columns: ['userId', 'occurredAt'] }],
  },
  {
    id: 'waitlist',
    fields: [
      { key: 'email', type: 'string', required: true },
      { key: 'approved', type: 'boolean' },
    ],
    indexes: [{ columns: ['email'], type: 'unique' }, { columns: ['email', 'approved'] }],
  },
  {
    id: 'public_rate_limits',
    fields: [
      { key: 'scope', type: 'string', minSize: 64, required: true },
      { key: 'count', type: 'integer', required: true },
      { key: 'expiresAt', type: 'datetime', required: true },
    ],
    indexes: [{ columns: ['expiresAt'] }],
  },
];

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Load .env.local before running this script.`);
  return value;
}

function fieldProblems(resource: string, expected: Field[], actual: Array<Record<string, unknown>>) {
  const problems: string[] = [];
  const byKey = new Map(actual.map((field) => [String(field.key), field]));
  for (const field of expected) {
    const found = byKey.get(field.key);
    if (!found) {
      problems.push(`${resource}.${field.key} is missing`);
      continue;
    }
    if (found.status !== 'available') problems.push(`${resource}.${field.key} is ${found.status}`);
    const actualType = String(found.type);
    const format = String(found.format ?? '');
    const compatibleType =
      field.type === actualType ||
      (field.type === 'string' && (actualType === 'varchar' || (actualType === 'string' && format !== 'enum'))) ||
      (field.type === 'enum' && actualType === 'string' && format === 'enum') ||
      (field.type === 'float' && (actualType === 'double' || actualType === 'float'));
    if (field.type && !compatibleType) {
      problems.push(`${resource}.${field.key} type is ${found.type}, expected ${field.type}`);
    }
    if (field.required !== undefined && found.required !== field.required) {
      problems.push(`${resource}.${field.key} required is ${found.required}, expected ${field.required}`);
    }
    if (field.array !== undefined && Boolean(found.array) !== field.array) {
      problems.push(`${resource}.${field.key} array is ${Boolean(found.array)}, expected ${field.array}`);
    }
    if (field.minSize && Number(found.size ?? 0) < field.minSize) {
      problems.push(`${resource}.${field.key} size is ${found.size}, expected at least ${field.minSize}`);
    }
    if (field.elements) {
      const values = new Set(Array.isArray(found.elements) ? found.elements.map(String) : []);
      const missing = field.elements.filter((value) => !values.has(value));
      if (missing.length) problems.push(`${resource}.${field.key} enum is missing ${missing.join(', ')}`);
    }
  }
  return problems;
}

function indexProblems(
  resource: string,
  expected: { columns: string[]; type?: string }[] = [],
  actual: Array<Models.Index | Models.ColumnIndex>,
) {
  return expected.flatMap(({ columns, type = 'key' }) => {
    const found = actual.some((index) => {
      const values = 'columns' in index ? index.columns : index.attributes;
      return (
        index.status === 'available' &&
        index.type === type &&
        values.length === columns.length &&
        values.every((column, position) => column === columns[position])
      );
    });
    return found ? [] : [`${resource} needs an available ${type} index on ${columns.join(', ')}`];
  });
}

async function main() {
  const client = new Client()
    .setEndpoint(requiredEnv('NEXT_PUBLIC_APPWRITE_ENDPOINT'))
    .setProject(requiredEnv('NEXT_PUBLIC_APPWRITE_PROJECT_ID'))
    .setKey(requiredEnv('APPWRITE_API_KEY'));
  const databases = new Databases(client);
  const tablesDb = new TablesDB(client);
  const problems: string[] = [];

  for (const resource of collections) {
    try {
      const collection = await databases.getCollection({
        databaseId: DATABASE_ID,
        collectionId: resource.id,
      });
      if (collection.$permissions.length || collection.documentSecurity) {
        problems.push(`${resource.id} collection must be server-only with document security disabled`);
      }
      problems.push(
        ...fieldProblems(resource.id, resource.fields, collection.attributes as unknown as Array<Record<string, unknown>>),
        ...indexProblems(resource.id, resource.indexes, collection.indexes),
      );
    } catch (error) {
      problems.push(`${resource.id} collection is unavailable: ${(error as Error).message}`);
    }
  }

  for (const resource of tables) {
    try {
      const table = await tablesDb.getTable({ databaseId: DATABASE_ID, tableId: resource.id });
      if (table.$permissions.length || table.rowSecurity) {
        problems.push(`${resource.id} table must be server-only with row security disabled`);
      }
      problems.push(
        ...fieldProblems(resource.id, resource.fields, table.columns as unknown as Array<Record<string, unknown>>),
        ...indexProblems(resource.id, resource.indexes, table.indexes),
      );
    } catch (error) {
      problems.push(`${resource.id} table is unavailable: ${(error as Error).message}`);
    }
  }

  if (problems.length) {
    throw new Error(`Appwrite schema verification failed:\n- ${problems.join('\n- ')}`);
  }
  console.log('Appwrite schema matches the Brainfeather production contract.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
