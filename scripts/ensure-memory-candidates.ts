import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ?? 'brainfeather';
const TABLE_ID = 'memory_candidates';
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
] as const;
const CATEGORIES = [
  'preference',
  'context',
  'decision',
  'code',
  'project',
  'team',
] as const;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Load .env.local before running this script.`);
  return value;
}

function isConflict(error: unknown): boolean {
  return (error as { code?: number }).code === 409;
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: number }).code === 404;
}

async function existingKeys(tables: TablesDB): Promise<Set<string>> {
  const columns = await tables.listColumns({
    databaseId: DATABASE_ID,
    tableId: TABLE_ID,
    total: false,
  });
  return new Set(columns.columns.map((column) => column.key));
}

async function existingIndexKeys(tables: TablesDB): Promise<Set<string>> {
  const indexes = await tables.listIndexes({
    databaseId: DATABASE_ID,
    tableId: TABLE_ID,
    total: false,
  });
  return new Set(indexes.indexes.map((index) => index.key));
}

async function main() {
  const reset = process.argv.includes('--reset');
  const client = new Client()
    .setEndpoint(requiredEnv('NEXT_PUBLIC_APPWRITE_ENDPOINT'))
    .setProject(requiredEnv('NEXT_PUBLIC_APPWRITE_PROJECT_ID'))
    .setKey(requiredEnv('APPWRITE_API_KEY'));
  const tables = new TablesDB(client);

  if (reset) {
    try {
      await tables.deleteTable({ databaseId: DATABASE_ID, tableId: TABLE_ID });
      console.log(`deleted table ${TABLE_ID}`);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  try {
    await tables.getTable({ databaseId: DATABASE_ID, tableId: TABLE_ID });
    console.log(`table ${TABLE_ID} already exists`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await tables.createTable({
      databaseId: DATABASE_ID,
      tableId: TABLE_ID,
      name: 'Memory candidates',
      permissions: [],
      rowSecurity: false,
    });
    console.log(`created table ${TABLE_ID}`);
  }

  const keys = await existingKeys(tables);

  const createString = async (key: string, size: number, required: boolean) => {
    if (keys.has(key)) return;
    try {
      await tables.createStringColumn({
        databaseId: DATABASE_ID,
        tableId: TABLE_ID,
        key,
        size,
        required,
      });
      keys.add(key);
      console.log(`created column ${key}`);
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  };

  const createEnum = async (
    key: string,
    elements: readonly string[],
    required: boolean,
  ) => {
    if (keys.has(key)) return;
    try {
      await tables.createEnumColumn({
        databaseId: DATABASE_ID,
        tableId: TABLE_ID,
        key,
        elements: [...elements],
        required,
      });
      keys.add(key);
      console.log(`created column ${key}`);
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  };

  await createString('userId', 64, true);
  await createString('sessionId', 256, false);
  await createEnum('source', SOURCES, true);
  await createEnum('category', CATEGORIES, true);
  await createString('content', 4000, true);
  await createString('title', 256, false);
  await createString('projectId', 256, false);
  await createString('provenance', 768, false);
  if (!keys.has('confidence')) {
    try {
      await tables.createFloatColumn({
        databaseId: DATABASE_ID,
        tableId: TABLE_ID,
        key: 'confidence',
        required: true,
        min: 0,
        max: 1,
      });
      keys.add('confidence');
      console.log('created column confidence');
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  await createEnum('status', ['pending', 'approved', 'rejected'], true);
  if (!keys.has('reviewedAt')) {
    try {
      await tables.createDatetimeColumn({
        databaseId: DATABASE_ID,
        tableId: TABLE_ID,
        key: 'reviewedAt',
        required: false,
      });
      keys.add('reviewedAt');
      console.log('created column reviewedAt');
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  await createString('decision', 1500, false);

  const indexes = await existingIndexKeys(tables);
  if (!indexes.has('idx_user_status')) {
    try {
      await tables.createIndex({
        databaseId: DATABASE_ID,
        tableId: TABLE_ID,
        key: 'idx_user_status',
        type: TablesDBIndexType.Key,
        columns: ['userId', 'status'],
      });
      console.log('created index idx_user_status');
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }

  console.log('memory_candidates schema is ready.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
