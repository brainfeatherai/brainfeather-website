import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import {
  isMissingCandidatesTable,
  listMemoryCandidates,
  type CandidateStatus,
} from '@/lib/server/candidate-store';
import { reportServerError } from '@/lib/server/report-error';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';

const STATUSES = new Set<CandidateStatus>(['pending', 'approved', 'rejected']);
const noStore = { 'Cache-Control': 'no-store, private' };

async function listCandidates(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const search = new URL(request.url).searchParams;
  const requestedStatus = search.get('status') ?? 'pending';
  if (!STATUSES.has(requestedStatus as CandidateStatus)) {
    return fail(400, 'status must be pending, approved or rejected.');
  }
  const rawLimit = Number(search.get('limit') ?? 100);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    return fail(400, 'limit must be an integer from 1 to 100.');
  }

  try {
    const candidates = await listMemoryCandidates(auth.userId, {
      status: requestedStatus as CandidateStatus,
      limit: rawLimit,
    });
    return Response.json({ candidates }, { headers: noStore });
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
