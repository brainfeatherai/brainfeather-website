import { account, databases } from '@/lib/appwrite';
import { ID, Permission, Query, OAuthProvider, Role } from 'appwrite';
import type { ContextRule, Team, TeamMember, Decision, Pattern } from '@/types';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const USERS_COLLECTION = 'users';
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

  async createEmailPassword(email: string, password: string, name: string) {
    const user = await account.create(ID.unique(), email, password, name);

    // Create user profile in database
    await databases.createDocument(
      DATABASE_ID,
      USERS_COLLECTION,
      user.$id,
      {
        email: user.email,
        name: user.name,
        plan: 'free',
        memoriesCount: 0,
        lastActiveAt: new Date().toISOString(),
      },
      /* Owner-scoped row: the doc id IS the auth userId, and the users
         collection runs with document security (create-only at
         collection level). */
      [Permission.read(Role.user(user.$id)), Permission.update(Role.user(user.$id))],
    );

    return user;
  },

  async getCurrentUser() {
    try {
      return await account.get();
    } catch {
      return null;
    }
  },

  async createJWT() {
    return await account.createJWT({ duration: 3600 });
  },

  /* Full-page redirect to the provider, so nothing after this runs.

     createOAuth2Token, NOT createOAuth2Session. The session flow has
     Appwrite set a session cookie on ITS OWN domain
     (sgp.cloud.appwrite.io) while the app runs somewhere else. The
     browser sees a third-party cookie and drops it, so the OAuth round
     trip finishes, redirects back, and the user is still signed out —
     silently, with no error anywhere.

     The token flow returns userId + secret on the success URL instead.
     The app exchanges them for a session from its own origin, which
     lets the SDK fall back to localStorage (X-Fallback-Cookies) when
     the cookie is refused. Works regardless of cookie policy.

     Object-argument form: the positional overload is deprecated here.

     No `scopes` passed — Google's default grant already carries email
     and profile, and anything beyond those two non-sensitive scopes
     drags the OAuth app into Google's verification review. */
  signInWithOAuth(provider: OAuthProvider, origin: string) {
    return account.createOAuth2Token({
      provider,
      success: `${origin}/auth/callback`,
      failure: `${origin}/login?error=oauth`,
    });
  },

  /* Second half of the token flow: trade the one-time secret for a real
     session. Single-use and short-lived, so this runs immediately on the
     callback route. */
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
  async ensureProfile(user: { $id: string; email: string; name: string }) {
    try {
      return await databases.getDocument(DATABASE_ID, USERS_COLLECTION, user.$id);
    } catch {
      return await databases.createDocument(
        DATABASE_ID,
        USERS_COLLECTION,
        user.$id,
        {
          email: user.email,
          name: user.name,
          plan: 'free',
          memoriesCount: 0,
          lastActiveAt: new Date().toISOString(),
        },
        [Permission.read(Role.user(user.$id)), Permission.update(Role.user(user.$id))],
      );
    }
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
   would bypass the encryption boundary. */

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
