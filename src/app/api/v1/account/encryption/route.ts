import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import { migrateOwnedDataEncryption } from '@/lib/server/memory-store';
import { reportServerError } from '@/lib/server/report-error';

export async function POST(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  try {
    const migrated = await migrateOwnedDataEncryption(auth.userId);
    return Response.json(migrated, {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch (error) {
    reportServerError(error, {
      operation: 'account.encrypt_data',
      route: '/api/v1/account/encryption',
      userId: auth.userId,
    });
    return fail(500, 'Could not migrate encrypted account data.');
  }
}
