import {
  Client,
  Databases,
  DatabasesIndexType,
  TablesDB,
  TablesDBIndexType,
  type Models,
} from 'node-appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ?? 'brainfeather';
const SOURCES = [
  'manual', 'chatgpt', 'claude', 'cursor', 'slack', 'chrome',
  'opencode', 'codex', 'antigravity',
];
const CATEGORIES = ['preference', 'context', 'decision', 'code', 'project', 'team'];

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Load .env.local before running this script.`);
  return value;
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: number }).code === 404;
}

async function waitForColumns(tables: TablesDB, tableId: string): Promise<Models.Table> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const table = await tables.getTable({ databaseId: DATABASE_ID, tableId });
    if (table.columns.every((column) => column.status === 'available')) return table;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${tableId} columns.`);
}

async function ensureTable(tables: TablesDB, id: string, name: string): Promise<Models.Table> {
  try {
    const table = await tables.getTable({ databaseId: DATABASE_ID, tableId: id });
    if (table.$permissions.length || table.rowSecurity) {
      return tables.updateTable({
        databaseId: DATABASE_ID,
        tableId: id,
        name: table.name,
        permissions: [],
        rowSecurity: false,
        enabled: table.enabled,
      });
    }
    return table;
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return tables.createTable({
      databaseId: DATABASE_ID,
      tableId: id,
      name,
      permissions: [],
      rowSecurity: false,
    });
  }
}

async function hardenCollection(databases: Databases, id: string): Promise<Models.Collection> {
  const collection = await databases.getCollection({ databaseId: DATABASE_ID, collectionId: id });
  if (!collection.$permissions.length && !collection.documentSecurity) return collection;
  return databases.updateCollection({
    databaseId: DATABASE_ID,
    collectionId: id,
    name: collection.name,
    permissions: [],
    documentSecurity: false,
    enabled: collection.enabled,
  });
}

async function ensureString(
  tables: TablesDB,
  tableId: string,
  columns: Map<string, Models.Table['columns'][number]>,
  key: string,
  size: number,
  required: boolean,
) {
  const existing = columns.get(key);
  if (!existing) {
    await tables.createStringColumn({ databaseId: DATABASE_ID, tableId, key, size, required });
  } else if ('size' in existing && existing.size < size) {
    const params = {
      databaseId: DATABASE_ID,
      tableId,
      key,
      size,
      required,
      xdefault: existing.default ?? null,
    };
    await (tables.updateStringColumn as unknown as (input: typeof params) => Promise<unknown>)(params);
  }
}

async function ensureEnum(
  tables: TablesDB,
  tableId: string,
  columns: Map<string, Models.Table['columns'][number]>,
  key: string,
  elements: string[],
  required: boolean,
) {
  const existing = columns.get(key);
  if (!existing) {
    await tables.createEnumColumn({ databaseId: DATABASE_ID, tableId, key, elements, required });
  } else if ('elements' in existing) {
    const merged = [...new Set([...existing.elements, ...elements])];
    if (merged.length !== existing.elements.length) {
      const params = {
        databaseId: DATABASE_ID,
        tableId,
        key,
        elements: merged,
        required,
        xdefault: existing.default ?? null,
      };
      await (tables.updateEnumColumn as unknown as (input: typeof params) => Promise<unknown>)(params);
    }
  }
}

async function ensureIndex(
  tables: TablesDB,
  tableId: string,
  key: string,
  columns: string[],
  type = TablesDBIndexType.Key,
) {
  const indexes = await tables.listIndexes({ databaseId: DATABASE_ID, tableId, total: false });
  const exact = indexes.indexes.find(
    (index) =>
      index.type === type &&
      index.columns.length === columns.length &&
      index.columns.every((column, position) => column === columns[position]),
  );
  if (exact?.status === 'available') return;
  if (exact) await tables.deleteIndex({ databaseId: DATABASE_ID, tableId, key: exact.key });
  const keyed = indexes.indexes.find((index) => index.key === key);
  if (keyed && keyed !== exact) {
    await tables.deleteIndex({ databaseId: DATABASE_ID, tableId, key: keyed.key });
  }
  await tables.createIndex({
    databaseId: DATABASE_ID,
    tableId,
    key,
    type,
    columns,
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    const current = await tables.listIndexes({ databaseId: DATABASE_ID, tableId, total: false });
    const created = current.indexes.find((index) => index.key === key);
    if (created?.status === 'available') return;
    if (created?.status === 'failed' || created?.status === 'stuck') {
      throw new Error(`${tableId}.${key} index failed: ${created.error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${tableId}.${key} index.`);
}

async function ensureCollectionIndex(
  databases: Databases,
  collectionId: string,
  key: string,
  attributes: string[],
  type = DatabasesIndexType.Key,
) {
  const collection = await databases.getCollection({ databaseId: DATABASE_ID, collectionId });
  const exact = collection.indexes.find(
    (index) =>
      index.type === type &&
      index.attributes.length === attributes.length &&
      index.attributes.every((attribute, position) => attribute === attributes[position]),
  );
  if (exact?.status === 'available') return;
  if (exact) {
    await databases.deleteIndex({ databaseId: DATABASE_ID, collectionId, key: exact.key });
  }
  const keyed = collection.indexes.find((index) => index.key === key);
  if (keyed && keyed !== exact) {
    await databases.deleteIndex({ databaseId: DATABASE_ID, collectionId, key: keyed.key });
  }
  await databases.createIndex({
    databaseId: DATABASE_ID,
    collectionId,
    key,
    type,
    attributes,
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    const current = await databases.getCollection({ databaseId: DATABASE_ID, collectionId });
    const created = current.indexes.find((index) => index.key === key);
    if (created?.status === 'available') return;
    if (created?.status === 'failed' || created?.status === 'stuck') {
      throw new Error(`${collectionId}.${key} index failed: ${created.error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${collectionId}.${key} index.`);
}

async function ensureMemoryCandidates(tables: TablesDB) {
  let table = await ensureTable(tables, 'memory_candidates', 'Memory candidates');
  let columns = new Map(table.columns.map((column) => [column.key, column]));
  await ensureString(tables, table.$id, columns, 'userId', 64, true);
  await ensureString(tables, table.$id, columns, 'sessionId', 256, false);
  await ensureEnum(tables, table.$id, columns, 'source', SOURCES, true);
  await ensureEnum(tables, table.$id, columns, 'category', CATEGORIES, true);
  await ensureString(tables, table.$id, columns, 'content', 4000, true);
  await ensureString(tables, table.$id, columns, 'title', 256, false);
  await ensureString(tables, table.$id, columns, 'projectId', 256, false);
  await ensureString(tables, table.$id, columns, 'provenance', 768, false);
  if (!columns.has('confidence')) {
    await tables.createFloatColumn({
      databaseId: DATABASE_ID, tableId: table.$id, key: 'confidence', required: true, min: 0, max: 1,
    });
  }
  await ensureEnum(tables, table.$id, columns, 'status', ['pending', 'approved', 'rejected'], true);
  if (!columns.has('reviewedAt')) {
    await tables.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: table.$id, key: 'reviewedAt', required: false });
  }
  await ensureString(tables, table.$id, columns, 'decision', 1500, false);
  table = await waitForColumns(tables, table.$id);
  columns = new Map(table.columns.map((column) => [column.key, column]));
  await ensureIndex(tables, table.$id, 'idx_user_status', ['userId', 'status']);
}

async function ensureApiRequests(tables: TablesDB) {
  const table = await ensureTable(tables, 'api_requests', 'API requests');
  const columns = new Map(table.columns.map((column) => [column.key, column]));
  await ensureString(tables, table.$id, columns, 'userId', 64, true);
  await ensureString(tables, table.$id, columns, 'keyId', 64, true);
  await ensureString(tables, table.$id, columns, 'operation', 64, true);
  await ensureString(tables, table.$id, columns, 'method', 16, true);
  if (!columns.has('status')) await tables.createIntegerColumn({ databaseId: DATABASE_ID, tableId: table.$id, key: 'status', required: true, min: 100, max: 599 });
  if (!columns.has('durationMs')) await tables.createIntegerColumn({ databaseId: DATABASE_ID, tableId: table.$id, key: 'durationMs', required: true, min: 0 });
  if (!columns.has('occurredAt')) await tables.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: table.$id, key: 'occurredAt', required: true });
  await waitForColumns(tables, table.$id);
  await ensureIndex(tables, table.$id, 'idx_user_occurred', ['userId', 'occurredAt']);
}

async function ensureRateLimits(tables: TablesDB) {
  const table = await ensureTable(tables, 'public_rate_limits', 'Public rate limits');
  const columns = new Map(table.columns.map((column) => [column.key, column]));
  await ensureString(tables, table.$id, columns, 'scope', 64, true);
  if (!columns.has('count')) await tables.createIntegerColumn({ databaseId: DATABASE_ID, tableId: table.$id, key: 'count', required: true, min: 0 });
  if (!columns.has('expiresAt')) await tables.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: table.$id, key: 'expiresAt', required: true });
  await waitForColumns(tables, table.$id);
  await ensureIndex(tables, table.$id, 'idx_expires_at', ['expiresAt']);
}

async function ensureWaitlist(tables: TablesDB) {
  const table = await ensureTable(tables, 'waitlist', 'Waitlist');
  const columns = new Map(table.columns.map((column) => [column.key, column]));
  await ensureString(tables, table.$id, columns, 'email', 254, true);
  if (!columns.has('approved')) {
    await tables.createBooleanColumn({
      databaseId: DATABASE_ID,
      tableId: table.$id,
      key: 'approved',
      required: false,
      xdefault: false,
    });
  }
  await waitForColumns(tables, table.$id);
  await ensureIndex(tables, table.$id, 'idx_email', ['email'], TablesDBIndexType.Unique);
  await ensureIndex(tables, table.$id, 'idx_email_approved', ['email', 'approved']);
}

async function ensureCoreCollections(databases: Databases) {
  await hardenCollection(databases, 'users');
  const memories = await hardenCollection(databases, 'memories');
  const byKey = new Map(memories.attributes.map((attribute) => [attribute.key, attribute]));
  const source = byKey.get('source');
  if (source && 'elements' in source) {
    const elements = [...new Set([...source.elements, ...SOURCES])];
    if (elements.length !== source.elements.length) {
      const params = {
        databaseId: DATABASE_ID,
        collectionId: 'memories',
        key: 'source',
        elements,
        required: source.required,
        xdefault: source.default ?? null,
      };
      await (databases.updateEnumAttribute as unknown as (input: typeof params) => Promise<unknown>)(params);
    }
  }
  for (const [key, size] of [['content', 11000], ['title', 1024], ['metadata', 3000]] as const) {
    const attribute = byKey.get(key);
    if (attribute && 'size' in attribute && attribute.size < size) {
      const params = {
        databaseId: DATABASE_ID,
        collectionId: 'memories',
        key,
        required: attribute.required,
        size,
        xdefault: attribute.default ?? null,
      };
      await (databases.updateStringAttribute as unknown as (input: typeof params) => Promise<unknown>)(params);
    }
  }
  await ensureCollectionIndex(databases, 'memories', 'idx_user_status', ['userId', 'status']);
  await ensureCollectionIndex(databases, 'memories', 'idx_user_project', ['userId', 'projectId']);
  await ensureCollectionIndex(databases, 'memories', 'idx_user_category', ['userId', 'category']);

  const entities = await hardenCollection(databases, 'entities');
  const entityFields = new Map(entities.attributes.map((attribute) => [attribute.key, attribute]));
  for (const key of ['summary', 'metadata'] as const) {
    const attribute = entityFields.get(key);
    if (!attribute) {
      await databases.createStringAttribute({ databaseId: DATABASE_ID, collectionId: 'entities', key, size: 3000, required: false });
    } else if ('size' in attribute && attribute.size < 3000) {
      const params = {
        databaseId: DATABASE_ID,
        collectionId: 'entities',
        key,
        required: attribute.required,
        size: 3000,
        xdefault: attribute.default ?? null,
      };
      await (databases.updateStringAttribute as unknown as (input: typeof params) => Promise<unknown>)(params);
    }
  }
  await ensureCollectionIndex(databases, 'entities', 'idx_user_name', ['userId', 'name']);
  await ensureCollectionIndex(databases, 'entities', 'idx_user_type', ['userId', 'type']);

  await hardenCollection(databases, 'edges');
  await ensureCollectionIndex(databases, 'edges', 'idx_user_source', ['userId', 'sourceId']);
  await ensureCollectionIndex(databases, 'edges', 'idx_user_target', ['userId', 'targetId']);
  const apiKeys = await hardenCollection(databases, 'api_keys');
  const keyField = apiKeys.attributes.find((attribute) => attribute.key === 'key');
  if (keyField && 'size' in keyField && keyField.size < 90) {
    const params = {
      databaseId: DATABASE_ID,
      collectionId: 'api_keys',
      key: 'key',
      required: keyField.required,
      size: 90,
      xdefault: keyField.default ?? null,
    };
    await (databases.updateStringAttribute as unknown as (input: typeof params) => Promise<unknown>)(params);
  }
  const uniqueKey = apiKeys.indexes.find(
    (index) =>
      index.type === DatabasesIndexType.Unique &&
      index.attributes.length === 1 &&
      index.attributes[0] === 'key',
  );
  if (!uniqueKey || uniqueKey.status !== 'available') {
    if (uniqueKey) {
      await databases.deleteIndex({
        databaseId: DATABASE_ID,
        collectionId: 'api_keys',
        key: uniqueKey.key,
      });
    }
    const conflicting = apiKeys.indexes.find((index) => index.key === 'idx_key');
    if (conflicting && conflicting !== uniqueKey) {
      await databases.deleteIndex({
        databaseId: DATABASE_ID,
        collectionId: 'api_keys',
        key: conflicting.key,
      });
    }
    await databases.createIndex({ databaseId: DATABASE_ID, collectionId: 'api_keys', key: 'idx_key', type: DatabasesIndexType.Unique, attributes: ['key'] });
  }
  await ensureCollectionIndex(databases, 'api_keys', 'idx_user', ['userId']);
}

async function main() {
  const client = new Client()
    .setEndpoint(requiredEnv('NEXT_PUBLIC_APPWRITE_ENDPOINT'))
    .setProject(requiredEnv('NEXT_PUBLIC_APPWRITE_PROJECT_ID'))
    .setKey(requiredEnv('APPWRITE_API_KEY'));
  const databases = new Databases(client);
  const tables = new TablesDB(client);
  await ensureCoreCollections(databases);
  await ensureMemoryCandidates(tables);
  await ensureApiRequests(tables);
  await ensureRateLimits(tables);
  await ensureWaitlist(tables);
  console.log('Appwrite production schema migration completed. Run npm run schema:verify next.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
