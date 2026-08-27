import 'server-only';

import { adminDb, COLLECTIONS, DATABASE_ID } from './appwrite-admin';
export { isApprovedEmail } from './waitlist';

export async function hasProfile(userId: string): Promise<boolean> {
  try {
    await adminDb.getDocument(DATABASE_ID, COLLECTIONS.users, userId);
    return true;
  } catch {
    return false;
  }
}
