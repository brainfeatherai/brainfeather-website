import { account, databases, client } from '@/lib/appwrite';
import { ID, Query, Permission, Role } from 'appwrite';
import type { User, Memory, ContextRule, Team, TeamMember, ApiKey, Decision, Pattern } from '@/types';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const USERS_COLLECTION = 'users';
const MEMORIES_COLLECTION = 'memories';
const CONTEXT_RULES_COLLECTION = 'context_rules';
const TEAMS_COLLECTION = 'teams';
const TEAM_MEMBERS_COLLECTION = 'team_members';
const API_KEYS_COLLECTION = 'api_keys';
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
      }
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

// Memory services
export const memoryService = {
  async create(memory: Omit<Memory, '$id' | '$createdAt' | '$updatedAt'>) {
    return await databases.createDocument(
      DATABASE_ID,
      MEMORIES_COLLECTION,
      ID.unique(),
      memory
    );
  },

  async list(userId: string, page = 1, limit = 20) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      MEMORIES_COLLECTION,
      [
        Query.equal('userId', userId),
        Query.orderDesc('$createdAt'),
        Query.limit(limit),
        Query.offset((page - 1) * limit),
      ]
    );
    return response;
  },

  async getById(id: string) {
    return await databases.getDocument(DATABASE_ID, MEMORIES_COLLECTION, id);
  },

  async update(id: string, data: Partial<Memory>) {
    return await databases.updateDocument(DATABASE_ID, MEMORIES_COLLECTION, id, data);
  },

  async delete(id: string) {
    return await databases.deleteDocument(DATABASE_ID, MEMORIES_COLLECTION, id);
  },

  async search(userId: string, query: string) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      MEMORIES_COLLECTION,
      [
        Query.equal('userId', userId),
        Query.search('content', query),
        Query.orderDesc('$createdAt'),
      ]
    );
    return response;
  },

  async getByCategory(userId: string, category: Memory['category']) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      MEMORIES_COLLECTION,
      [
        Query.equal('userId', userId),
        Query.equal('category', category),
        Query.orderDesc('$createdAt'),
      ]
    );
    return response;
  },

  async getBySource(userId: string, source: Memory['source']) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      MEMORIES_COLLECTION,
      [
        Query.equal('userId', userId),
        Query.equal('source', source),
        Query.orderDesc('$createdAt'),
      ]
    );
    return response;
  },
};

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

// API Key services
export const apiKeyService = {
  async create(userId: string, name: string) {
    const key = `bf_${ID.unique()}`;
    return await databases.createDocument(
      DATABASE_ID,
      API_KEYS_COLLECTION,
      ID.unique(),
      {
        userId,
        name,
        key,
      }
    );
  },

  async list(userId: string) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      API_KEYS_COLLECTION,
      [
        Query.equal('userId', userId),
        Query.orderDesc('$createdAt'),
      ]
    );
    return response;
  },

  async delete(id: string) {
    return await databases.deleteDocument(DATABASE_ID, API_KEYS_COLLECTION, id);
  },

  async updateLastUsed(id: string) {
    return await databases.updateDocument(DATABASE_ID, API_KEYS_COLLECTION, id, {
      lastUsedAt: new Date().toISOString(),
    });
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
