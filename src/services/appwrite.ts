import { account, databases } from '@/lib/appwrite';
import { ID, OAuthProvider, Query } from 'appwrite';
import type { ContextRule, Team, TeamMember, Decision, Pattern } from '@/types';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const CONTEXT_RULES_COLLECTION = 'context_rules';
const TEAMS_COLLECTION = 'teams';
const TEAM_MEMBERS_COLLECTION = 'team_members';
const DECISIONS_COLLECTION = 'decisions';
const PATTERNS_COLLECTION = 'patterns';

// Auth services
export const authService = {
  async createEmailSession(email: string, password: string) {
    return await account.createEmailPasswordSession(email, password);
  },

  async createEmailPassword(email: string, password: string, name: string, inviteId: string) {
    const response = await fetch('/api/public/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, inviteId }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(body?.error ?? 'Could not create your Brainfeather account.');
    }
    return { email, name };
  },

  async getCurrentUser() {
    try {
      return await Promise.race([
        account.get(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('session-probe-timeout')), 8_000);
        }),
      ]);
    } catch {
      return null;
    }
  },

  async createJWT() {
    return await account.createJWT({ duration: 3600 });
  },

  signInWithGoogle(origin: string) {
    return account.createOAuth2Token({
      provider: OAuthProvider.Google,
      success: `${origin}/auth/callback`,
      failure: `${origin}/login?error=oauth`,
    });
  },

  /* The server access gate rejects OAuth sessions whose email has not
     been approved, so exposing Google here does not weaken invite-only access. */
  async completeOAuth(userId: string, secret: string) {
    return await account.createSession({ userId, secret });
  },

  /* Idempotent profile row.

     createEmailPassword writes this document itself, but an OAuth signup
     never touches that path — Appwrite creates the auth account directly.
     Without this, a Google user has a session and no `users` row, so
     anything reading plan or memoriesCount gets a 404 for them.

     Caller treats a throw as non-fatal: a missing profile degrades the
     dashboard, but it should not block a valid session from signing in. */
  async ensureProfile(jwt: string) {
    const response = await fetch('/api/v1/account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? 'Could not provision your Brainfeather account.');
    }
    return response.json();
  },

  async logout() {
    return await account.deleteSession('current');
  },

  async sendPasswordRecovery(email: string) {
    return await account.createRecovery(email, `${window.location.origin}/reset-password`);
  },

  async resetPassword(userId: string, secret: string, password: string) {
    return await account.updateRecovery(userId, secret, password);
  },
};

/* Memory access intentionally has no browser-SDK service. Memory fields are
   encrypted by the authenticated server API, so a client-side database path
   would either expose ciphertext or bypass the encryption boundary. */

// Context Rule services
export const contextRuleService = {
  async create(rule: Omit<ContextRule, '$id' | '$createdAt' | '$updatedAt'>) {
    return await databases.createDocument(
      DATABASE_ID,
      CONTEXT_RULES_COLLECTION,
      ID.unique(),
      rule
    );
  },

  async list(userId: string) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      CONTEXT_RULES_COLLECTION,
      [
        Query.equal('userId', userId),
        Query.orderDesc('$createdAt'),
      ]
    );
    return response;
  },

  async update(id: string, data: Partial<ContextRule>) {
    return await databases.updateDocument(DATABASE_ID, CONTEXT_RULES_COLLECTION, id, data);
  },

  async delete(id: string) {
    return await databases.deleteDocument(DATABASE_ID, CONTEXT_RULES_COLLECTION, id);
  },
};

// Team services
export const teamService = {
  async create(name: string, ownerId: string) {
    return await databases.createDocument(
      DATABASE_ID,
      TEAMS_COLLECTION,
      ID.unique(),
      {
        name,
        ownerId,
        plan: 'team',
        membersCount: 1,
      }
    );
  },

  async list(userId: string) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      TEAMS_COLLECTION,
      [
        Query.equal('ownerId', userId),
        Query.orderDesc('$createdAt'),
      ]
    );
    return response;
  },

  async getById(id: string) {
    return await databases.getDocument(DATABASE_ID, TEAMS_COLLECTION, id);
  },

  async update(id: string, data: Partial<Team>) {
    return await databases.updateDocument(DATABASE_ID, TEAMS_COLLECTION, id, data);
  },

  async delete(id: string) {
    return await databases.deleteDocument(DATABASE_ID, TEAMS_COLLECTION, id);
  },
};

// Team Member services
export const teamMemberService = {
  async add(teamId: string, userId: string, role: TeamMember['role'] = 'member') {
    return await databases.createDocument(
      DATABASE_ID,
      TEAM_MEMBERS_COLLECTION,
      ID.unique(),
      {
        teamId,
        userId,
        role,
      }
    );
  },

  async list(teamId: string) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      TEAM_MEMBERS_COLLECTION,
      [
        Query.equal('teamId', teamId),
        Query.orderAsc('$createdAt'),
      ]
    );
    return response;
  },

  async remove(id: string) {
    return await databases.deleteDocument(DATABASE_ID, TEAM_MEMBERS_COLLECTION, id);
  },

  async updateRole(id: string, role: TeamMember['role']) {
    return await databases.updateDocument(DATABASE_ID, TEAM_MEMBERS_COLLECTION, id, { role });
  },
};

// Decision services
export const decisionService = {
  async create(decision: Omit<Decision, '$id' | '$createdAt'>) {
    return await databases.createDocument(
      DATABASE_ID,
      DECISIONS_COLLECTION,
      ID.unique(),
      decision
    );
  },

  async list(teamId: string) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      DECISIONS_COLLECTION,
      [
        Query.equal('teamId', teamId),
        Query.orderDesc('$createdAt'),
      ]
    );
    return response;
  },

  async update(id: string, data: Partial<Decision>) {
    return await databases.updateDocument(DATABASE_ID, DECISIONS_COLLECTION, id, data);
  },

  async delete(id: string) {
    return await databases.deleteDocument(DATABASE_ID, DECISIONS_COLLECTION, id);
  },
};

// Pattern services
export const patternService = {
  async create(pattern: Omit<Pattern, '$id' | '$createdAt'>) {
    return await databases.createDocument(
      DATABASE_ID,
      PATTERNS_COLLECTION,
      ID.unique(),
      pattern
    );
  },

  async list(userId: string) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      PATTERNS_COLLECTION,
      [
        Query.equal('userId', userId),
        Query.orderDesc('frequency'),
      ]
    );
    return response;
  },

  async update(id: string, data: Partial<Pattern>) {
    return await databases.updateDocument(DATABASE_ID, PATTERNS_COLLECTION, id, data);
  },

  async delete(id: string) {
    return await databases.deleteDocument(DATABASE_ID, PATTERNS_COLLECTION, id);
  },
};
