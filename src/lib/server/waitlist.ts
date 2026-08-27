import 'server-only';

import { ID, Query, type Models } from 'node-appwrite';
import { normalizeWaitlistEmail } from '../waitlist-email-address.ts';
import { adminTables, COLLECTIONS, DATABASE_ID } from './appwrite-admin';

export const WAITLIST_COOKIE = 'brainfeather_waitlist';

type WaitlistData = {
  email: string;
  source?: string;
  submittedAt?: string;
  approved?: boolean;
};

export type WaitlistRow = Models.Row & WaitlistData;
type WaitlistApiRow = Models.Row & Partial<WaitlistData> & {
  data?: Partial<WaitlistData>;
};

function normalizedWaitlistRow(row: WaitlistApiRow): WaitlistRow {
  const data = row.data ?? row;
  if (typeof data.email !== 'string') {
    throw new Error('[brainfeather] Appwrite returned a waitlist row without an email.');
  }
  return {
    ...row,
    email: data.email,
    source: data.source,
    submittedAt: data.submittedAt,
    approved: data.approved,
  };
}

export function isWaitlistId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(value);
}

export async function findWaitlistRequest(email: string): Promise<WaitlistRow | null> {
  const normalized = normalizeWaitlistEmail(email);
  const result = await adminTables.listRows<WaitlistApiRow>({
    databaseId: DATABASE_ID,
    tableId: COLLECTIONS.waitlist,
    queries: [Query.equal('email', normalized), Query.limit(1)],
    total: false,
    ttl: 0,
  });
  return result.rows[0] ? normalizedWaitlistRow(result.rows[0]) : null;
}

export async function getWaitlistRequest(rowId: string): Promise<WaitlistRow | null> {
  if (!isWaitlistId(rowId)) return null;
  try {
    const row = await adminTables.getRow<WaitlistApiRow>({
      databaseId: DATABASE_ID,
      tableId: COLLECTIONS.waitlist,
      rowId,
    });
    return normalizedWaitlistRow(row);
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    throw error;
  }
}

export async function createWaitlistRequest(email: string): Promise<{
  request: WaitlistRow;
  created: boolean;
}> {
  const normalized = normalizeWaitlistEmail(email);
  const existing = await findWaitlistRequest(normalized);
  if (existing) return { request: existing, created: false };

  try {
    const row = await adminTables.createRow<WaitlistApiRow>({
      databaseId: DATABASE_ID,
      tableId: COLLECTIONS.waitlist,
      rowId: ID.unique(),
      data: {
        email: normalized,
      },
      permissions: [],
    });
    return { request: normalizedWaitlistRow(row), created: true };
  } catch (error) {
    /* The unique email index can win a race between two submissions.
       In that case the request exists and should still report success. */
    if ((error as { code?: number }).code === 409) {
      const raced = await findWaitlistRequest(normalized);
      if (raced) return { request: raced, created: false };
    }
    throw error;
  }
}

export async function isApprovedEmail(email: string): Promise<boolean> {
  const normalized = normalizeWaitlistEmail(email);
  if (!normalized) return false;
  const result = await adminTables.listRows<WaitlistApiRow>({
    databaseId: DATABASE_ID,
    tableId: COLLECTIONS.waitlist,
    queries: [
      Query.equal('email', normalized),
      Query.equal('approved', true),
      Query.limit(1),
    ],
    total: false,
    ttl: 0,
  });
  return result.rows.some((row) => normalizedWaitlistRow(row).approved === true);
}

export async function approvedWaitlistRequest(
  rowId: string,
  email?: string,
): Promise<WaitlistRow | null> {
  const row = await getWaitlistRequest(rowId);
  if (!row || row.approved !== true) return null;
  if (email && row.email !== normalizeWaitlistEmail(email)) return null;
  return row;
}

export async function deleteWaitlistRequests(email: string): Promise<void> {
  const normalized = normalizeWaitlistEmail(email);
  await adminTables.deleteRows({
    databaseId: DATABASE_ID,
    tableId: COLLECTIONS.waitlist,
    queries: [Query.equal('email', normalized)],
  });
}
