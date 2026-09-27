import { authenticate, fail } from '@/lib/server/api-auth';
import {
  isMissingCandidatesTable,
  listMemoryCandidates,
  type CandidateStatus,
} from '@/lib/server/candidate-store';
import { reportServerError } from '@/lib/server/report-error';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { memoryMatchesScope } from '@/lib/server/memory-temporal';
import { memoryScope } from '@/lib/server/validate';

const STATUSES = new Set<CandidateStatus>(['pending', 'approved', 'rejected']);
const noStore = { 'Cache-Control': 'no-store, private' };

export const runtime = 'nodejs';

function publicCandidate(row: {
  $id: string;
  $createdAt: string;
  category: string;
  content: string;
  status: CandidateStatus;
  projectId?: string;
  branch?: string;
  taskId?: string;
  title?: string;
}) {
  return {
    $id: row.$id,
    $createdAt: row.$createdAt,
    category: row.category,
    content: row.content,
    status: row.status,
    ...(row.projectId ? { projectId: row.projectId } : {}),
    ...(row.branch ? { branch: row.branch } : {}),
    ...(row.taskId ? { taskId: row.taskId } : {}),
    ...(row.title ? { title: row.title } : {}),
  };
}

async function listCandidates(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const search = new URL(request.url).searchParams;
  const requestedStatus = search.get('status') ?? 'pending';
  if (!STATUSES.has(requestedStatus as CandidateStatus)) {
    return fail(400, 'status must be pending, approved or rejected.');
  }
  if (auth.credential !== 'jwt' && requestedStatus !== 'pending') {
    return fail(403, 'API keys can list pending review items only.');
  }

  const rawLimit = Number(search.get('limit') ?? 100);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    return fail(400, 'limit must be an integer from 1 to 100.');
  }

  const parsedScope = memoryScope({
    projectId: search.get('projectId'),
    branch: search.get('branch'),
    taskId: search.get('taskId'),
  });
  if (!parsedScope.ok) return fail(400, parsedScope.error);
  const scope = parsedScope.value;

  try {
    const candidates = await listMemoryCandidates(auth.userId, {
      status: requestedStatus as CandidateStatus,
      limit: rawLimit,
    });
    const scoped = Object.keys(scope).length
      ? candidates.filter((row) => memoryMatchesScope(row, scope))
      : candidates;
    return Response.json(
      {
        candidates:
          auth.credential === 'jwt' ? scoped : scoped.map(publicCandidate),
      },
      { headers: noStore },
    );
  } catch (error) {
    if (isMissingCandidatesTable(error)) {
      return Response.json({ candidates: [] }, { headers: noStore });
    }
    reportServerError(error, {
      operation: 'memory_candidate.list',
      route: '/api/v1/memory-candidates',
      userId: auth.userId,
    });
    return fail(500, 'Could not load memory candidates.');
  }
}

export const GET = withRequestTelemetry('memory_candidate.list', listCandidates);
