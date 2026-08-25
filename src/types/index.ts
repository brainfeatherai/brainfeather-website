export interface User {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  email: string;
  name: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  memoriesCount: number;
  lastActiveAt: string;
}

export interface Memory {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  userId: string;
  /* Mirrors the deployed `memories.source` enum in Appwrite. Unknown MCP
     clients map to `manual` until the live schema is expanded. */
  source:
    | 'manual'
    | 'chatgpt'
    | 'claude'
    | 'cursor'
    | 'slack'
    | 'chrome';
  title: string;
  content: string;
  category: 'preference' | 'context' | 'decision' | 'code' | 'project' | 'team';
  tags: string[];
  /* Temporal validity. The MCP server flips a fact to 'invalid' and records
     what replaced it, rather than deleting it — so anything reading memories
     for display MUST filter on status or it will show retracted facts. */
  status?: 'active' | 'invalid';
  supersededBy?: string;
  projectId?: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface ContextRule {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  userId: string;
  name: string;
  condition: string;
  context: string;
  priority: 'low' | 'medium' | 'high';
  enabled: boolean;
}

export interface Team {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  name: string;
  ownerId: string;
  plan: 'team' | 'enterprise';
  membersCount: number;
}

export interface TeamMember {
  $id: string;
  $createdAt: string;
  teamId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  user?: User;
}

export interface ApiKey {
  $id: string;
  $createdAt: string;
  name: string;
  keyHint: string;
  lastUsedAt?: string;
}

export interface Decision {
  $id: string;
  $createdAt: string;
  teamId: string;
  title: string;
  context: string;
  outcome: string;
  participants: string[];
  tags: string[];
}

export interface Pattern {
  $id: string;
  $createdAt: string;
  userId: string;
  type: 'repeated_task' | 'common_question' | 'workflow' | 'preference';
  description: string;
  frequency: number;
  lastSeenAt: string;
  suggestion?: string;
}

/* Graph nodes. Extracted automatically by the MCP/API pipeline from the
   facts that mention them; one row per canonical name per user. */
export interface Entity {
  $id: string;
  $createdAt: string;
  userId: string;
  name: string;
  type: 'tool' | 'language' | 'concept' | 'person' | 'project' | 'pattern';
  summary?: string;
}

/* An edge joins a memory to an entity ('mentioned_in') or two entities.
   `validTo` set means superseded — reads must filter it, same rule as
   memories.status. Weight is stored as an integer 0-10 because Appwrite
   has no double attribute type. */
export interface GraphEdge {
  $id: string;
  userId: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight: number;
  validFrom?: string;
  validTo?: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
