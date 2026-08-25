import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import { adminDb, COLLECTIONS, DATABASE_ID } from '@/lib/server/appwrite-admin';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);
  const { id } = await params;

  try {
    const row = await adminDb.getDocument(DATABASE_ID, COLLECTIONS.apiKeys, id);
    if (row.userId !== auth.userId) return fail(404, 'No such API key.');
    await adminDb.deleteDocument(DATABASE_ID, COLLECTIONS.apiKeys, id);
    return Response.json(
      { deleted: id },
      { headers: { 'Cache-Control': 'no-store, private' } },
    );
  } catch {
    return fail(404, 'No such API key.');
  }
}
