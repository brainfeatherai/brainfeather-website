import { timingSafeEqual } from 'node:crypto';
import { migrateAllDataEncryption } from '@/lib/server/memory-store';
import { reportServerError } from '@/lib/server/report-error';

function authorized(request: Request): boolean {
  const expected = process.env.BRAINFEATHER_MIGRATION_TOKEN;
  const actual = request.headers.get('x-brainfeather-migration-token');
  if (!expected || !actual) return false;

  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const migrated = await migrateAllDataEncryption();
    return Response.json(migrated, {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch (error) {
    reportServerError(error, {
      operation: 'admin.encrypt_data',
      route: '/api/v1/admin/encryption',
    });
    return Response.json(
      { error: 'Could not migrate encrypted account data.' },
      { status: 500 },
    );
  }
}
