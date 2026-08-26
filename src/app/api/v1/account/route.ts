import { Query } from 'node-appwrite';
import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import {
  adminDb,
  adminTables,
  adminUsers,
  COLLECTIONS,
  DATABASE_ID,
} from '@/lib/server/appwrite-admin';

async function deleteMatching(collectionId: string, attribute: string, value: string) {
  for (;;) {
    const page = await adminDb.listDocuments(DATABASE_ID, collectionId, [
      Query.equal(attribute, value),
      Query.limit(100),
    ]);
    if (!page.documents.length) return;
    await Promise.all(
      page.documents.map((document) =>
        adminDb.deleteDocument(DATABASE_ID, collectionId, document.$id),
      ),
    );
  }
}

async function getProfile(userId: string) {
  try {
    return await adminDb.getDocument(DATABASE_ID, COLLECTIONS.users, userId);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);
  const profile = await getProfile(auth.userId);
  return Response.json({ profile }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const existing = await getProfile(auth.userId);
  if (existing) return Response.json({ profile: existing });

  const profile = await adminDb.createDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.users,
    documentId: auth.userId,
    data: {
      email: auth.email ?? '',
      name: auth.name ?? '',
      plan: 'free',
      memoriesCount: 0,
      lastActiveAt: new Date().toISOString(),
    },
    permissions: [],
  });
  return Response.json({ profile }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const user = await adminUsers.get({ userId: auth.userId });
  for (;;) {
    const ownedTeams = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.teams, [
      Query.equal('ownerId', auth.userId),
      Query.limit(100),
    ]);
    if (!ownedTeams.documents.length) break;
    for (const team of ownedTeams.documents) {
      await deleteMatching(COLLECTIONS.decisions, 'teamId', team.$id);
      await deleteMatching(COLLECTIONS.teamMembers, 'teamId', team.$id);
      await adminDb.deleteDocument(DATABASE_ID, COLLECTIONS.teams, team.$id);
    }
  }

  await Promise.all([
    deleteMatching(COLLECTIONS.memories, 'userId', auth.userId),
    deleteMatching(COLLECTIONS.entities, 'userId', auth.userId),
    deleteMatching(COLLECTIONS.edges, 'userId', auth.userId),
    deleteMatching(COLLECTIONS.apiKeys, 'userId', auth.userId),
    adminTables.deleteRows({
      databaseId: DATABASE_ID,
      tableId: COLLECTIONS.apiRequests,
      queries: [Query.equal('userId', auth.userId)],
    }),
    deleteMatching(COLLECTIONS.contextRules, 'userId', auth.userId),
    deleteMatching(COLLECTIONS.patterns, 'userId', auth.userId),
    deleteMatching(COLLECTIONS.teamMembers, 'userId', auth.userId),
  ]);

  /* Delete the auth user before its profile and invite. If Appwrite
     rejects this final account operation, access remains intact and the
     user can sign in to retry rather than being locked out. */
  await adminUsers.delete({ userId: auth.userId });
  await Promise.all([
    adminDb.deleteDocument(DATABASE_ID, COLLECTIONS.users, auth.userId).catch(() => {}),
    deleteMatching(COLLECTIONS.waitlist, 'email', user.email.toLowerCase()),
  ]);
  return Response.json({ deleted: true });
}
