import 'server-only';

import { jaccardSimilarity, think, type Decision } from './think.ts';
import type { MemoryDoc } from './memory-store.ts';
import { listAllActive } from './memory-store.ts';

export type MemoryCluster = {
  ids: string[];
  category: string;
  mergedContent: string;
};

const RELATED = 0.62;

function parentOf(parents: Map<string, string>, id: string): string {
  let current = id;
  while (parents.get(current) !== current) {
    const next = parents.get(current);
    if (!next) break;
    current = next;
  }
  return current;
}

function union(parents: Map<string, string>, a: string, b: string): void {
  const left = parentOf(parents, a);
  const right = parentOf(parents, b);
  if (left !== right) parents.set(left, right);
}

export function mergeClusterContent(contents: readonly string[]): string {
  const fold = (value: string) =>
    value.toLowerCase().replace(/[\s.,;:]+$/g, '').trim();
  const unique: string[] = [];
  for (const content of [...contents].sort((a, b) => b.length - a.length)) {
    const trimmed = content.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    const folded = fold(trimmed);
    const absorbed = unique.findIndex((kept) => {
      const keptFolded = fold(kept);
      return keptFolded.includes(folded) || folded.includes(keptFolded);
    });
    if (absorbed >= 0) {
      if (trimmed.length > unique[absorbed].length) unique[absorbed] = trimmed;
      continue;
    }
    unique.push(trimmed);
  }
  return unique.join(' ');
}

export function relatedMemoryClusters(
  memories: readonly Pick<MemoryDoc, '$id' | 'content' | 'category' | '$createdAt'>[],
  threshold = RELATED,
): MemoryCluster[] {
  const parents = new Map(memories.map((memory) => [memory.$id, memory.$id]));

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const left = memories[i];
      const right = memories[j];
      if (left.category !== right.category) continue;
      if (jaccardSimilarity(left.content, right.content) >= threshold) {
        union(parents, left.$id, right.$id);
      }
    }
  }

  const groups = new Map<string, typeof memories[number][]>();
  for (const memory of memories) {
    const root = parentOf(parents, memory.$id);
    const group = groups.get(root) ?? [];
    group.push(memory);
    groups.set(root, group);
  }

  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .map((group) => {
      const ordered = [...group].sort(
        (a, b) => Date.parse(b.$createdAt) - Date.parse(a.$createdAt),
      );
      return {
        ids: ordered.map((memory) => memory.$id),
        category: ordered[0].category,
        mergedContent: mergeClusterContent(ordered.map((memory) => memory.content)),
      };
    });
}

export function consolidationCommits(opts: { commit?: boolean }): boolean {
  return opts.commit === true;
}

export function memoriesByProject(
  memories: readonly MemoryDoc[],
  projectId?: string,
): MemoryDoc[][] {
  const scoped = projectId
    ? memories.filter((memory) => memory.projectId === projectId)
    : [...memories];
  const groups = new Map<string, MemoryDoc[]>();
  for (const memory of scoped) {
    const key = memory.projectId ?? '';
    const group = groups.get(key) ?? [];
    group.push(memory);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export async function consolidateProjectMemories(
  userId: string,
  opts: { projectId?: string; commit?: boolean } = {},
): Promise<{ clusters: MemoryCluster[]; decisions: Decision[] }> {
  const memories = await listAllActive(userId);
  const clusters = memoriesByProject(memories, opts.projectId).flatMap((group) =>
    relatedMemoryClusters(group),
  );
  if (!consolidationCommits(opts)) return { clusters, decisions: [] };

  const decisions: Decision[] = [];
  for (const cluster of clusters) {
    const newest = cluster.ids[0];
    const rest = cluster.ids.slice(1);
    const current = memories.find((memory) => memory.$id === newest);
    if (!current || rest.length === 0) continue;
    const clusterProjectId = current.projectId ?? opts.projectId;
    const sameAsNewest =
      cluster.mergedContent === current.content.replace(/\s+/g, ' ').trim();

    if (sameAsNewest) {
      for (const id of rest) {
        decisions.push(
          await think(userId, {
            content: current.content,
            category: cluster.category,
            projectId: clusterProjectId,
            supersedesId: id,
            provenance: { type: 'agent', reference: `consolidate:${newest}` },
            confidence: 0.85,
          }),
        );
      }
      continue;
    }

    const first = await think(userId, {
        content: cluster.mergedContent,
        category: cluster.category,
        projectId: clusterProjectId,
        supersedesId: rest[0],
        provenance: { type: 'agent', reference: `consolidate:${newest}` },
        confidence: 0.85,
      });
    decisions.push(first);
    if (first.action === 'reject') continue;

    for (const id of rest.slice(1)) {
      decisions.push(
        await think(userId, {
          content: cluster.mergedContent,
          category: cluster.category,
          projectId: clusterProjectId,
          supersedesId: id,
          provenance: { type: 'agent', reference: `consolidate:${newest}` },
          confidence: 0.85,
        }),
      );
    }
  }

  return { clusters, decisions };
}
