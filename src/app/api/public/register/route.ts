import { ID } from 'node-appwrite';
import { adminDb, adminUsers, COLLECTIONS, DATABASE_ID } from '@/lib/server/appwrite-admin';

const EMAIL = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;
const DENIED = 'This email is not currently eligible for Brainfeather access.';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; name?: unknown; inviteId?: unknown }
    | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const inviteId = typeof body?.inviteId === 'string' ? body.inviteId.trim() : '';

  if (
    !EMAIL.test(email) ||
    email.length > 254 ||
    password.length < 8 ||
    name.length < 1 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(inviteId)
  ) {
    return Response.json({ error: 'Invalid registration details.' }, { status: 400 });
  }

  let invitation;
  try {
    invitation = await adminDb.getDocument(DATABASE_ID, COLLECTIONS.waitlist, inviteId);
  } catch {
    return Response.json({ error: DENIED }, { status: 403 });
  }
  if (invitation.email !== email || invitation.approved !== true) {
    return Response.json({ error: DENIED }, { status: 403 });
  }

  try {
    await adminUsers.create({ userId: ID.unique(), email, password, name: name.slice(0, 128) });
    return Response.json({ created: true }, { status: 201 });
  } catch {
    /* Keep approval and account-existence state private. */
    return Response.json({ error: DENIED }, { status: 403 });
  }
}
