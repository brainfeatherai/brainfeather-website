import 'server-only';

import { Query } from 'node-appwrite';
import { adminDb, COLLECTIONS, DATABASE_ID } from './appwrite-admin';

export async function hasProfile(userId: string): Promise<boolean> {
  try {
    await adminDb.getDocument(DATABASE_ID, COLLECTIONS.users, userId);
    return true;
  } catch {
    return false;
  }
}

export async function isApprovedEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const result = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.waitlist, [
    Query.equal('email', normalized),
    Query.equal('approved', true),
    Query.limit(1),
  ]);
  return result.documents.length > 0;
}
