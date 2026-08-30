import { Query } from 'node-appwrite';
import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import {
  adminDb,
  adminTables,
  adminUsers,
  COLLECTIONS,
  DATABASE_ID,
} from '@/lib/server/appwrite-admin';
import { isMissingCandidatesTable } from '@/lib/server/candidate-store';
import { isMissingTelemetryTable } from '@/lib/server/request-telemetry';
import { deleteWaitlistRequests } from '@/lib/server/waitlist';

async function deleteMatching(collectionId: string, attribute: string, value: string) {
  for (;;) {
    let page;
    try {
      page = await adminDb.listDocuments(DATABASE_ID, collectionId, [
        Query.equal(attribute, value),
        Query.limit(100),
      ]);
    } catch (error) {
      if ((error as { code?: number }).code === 404) return;
      throw error;
    }
    if (!page.documents.length) return;
    await Promise.all(
      page.documents.map((document) =>
        adminDb.deleteDocument(DATABASE_ID, collectionId, document.$id).catch((error) => {
          if ((error as { code?: number }).code !== 404) throw error;
        }),
      ),
    );
  }
}

async function listOwnedTeams(userId: string) {
  try {
    return await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.teams, [
      Query.equal('ownerId', userId),
      Query.limit(100),
    ]);
  } catch (error) {
    if ((error as { code?: number }).code === 404) return { documents: [] };
    throw error;
  }
}

async function getProfile(userId: string) {
  try {
    return await adminDb.getDocument(DATABASE_ID, COLLECTIONS.users, userId);
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    throw error;
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
    const ownedTeams = await listOwnedTeams(auth.userId);
    if (!ownedTeams.documents.length) break;
    for (const team of ownedTeams.documents) {
      await deleteMatching(COLLECTIONS.decisions, 'teamId', team.$id);
      await deleteMatching(COLLECTIONS.teamMembers, 'teamId', team.$id);
      await adminDb.deleteDocument(DATABASE_ID, COLLECTIONS.teams, team.$id);
    }
  }

  await Promise.all([
    deleteMatching(COLLECTIONS.memories, 'userId', auth.userId),
    deleteMatching(COLLECTIONS.memoryCandidates, 'userId', auth.userId).catch((error) => {
      if (!isMissingCandidatesTable(error)) throw error;
    }),
    deleteMatching(COLLECTIONS.entities, 'userId', auth.userId),
    deleteMatching(COLLECTIONS.edges, 'userId', auth.userId),
    deleteMatching(COLLECTIONS.apiKeys, 'userId', auth.userId),
    adminTables.deleteRows({
      databaseId: DATABASE_ID,
      tableId: COLLECTIONS.apiRequests,
      queries: [Query.equal('userId', auth.userId)],
    }).catch((error) => {
      if (!isMissingTelemetryTable(error)) throw error;
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
    deleteMatching(COLLECTIONS.apiKeys, 'userId', auth.userId),
    adminDb.deleteDocument(DATABASE_ID, COLLECTIONS.users, auth.userId).catch(() => {}),
    deleteWaitlistRequests(user.email),
  ]);
  return Response.json({ deleted: true });
}
