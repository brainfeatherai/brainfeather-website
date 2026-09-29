import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import {
  CandidateReviewError,
  undoAutoApproval,
} from '@/lib/server/candidate-review';
import { reportServerError } from '@/lib/server/report-error';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';

const noStore = { 'Cache-Control': 'no-store, private' };

export const runtime = 'nodejs';

async function undoCandidate(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const { id } = await params;
  try {
    const result = await undoAutoApproval(auth.userId, id);
    return Response.json(result, { headers: noStore });
  } catch (error) {
    if (error instanceof CandidateReviewError) {
      return fail(error.status, error.message);
    }
    reportServerError(error, {
      operation: 'memory_candidate.undo',
      route: '/api/v1/memory-candidates/:id/undo',
      userId: auth.userId,
      resourceId: id,
    });
    return fail(500, 'Could not undo the auto-approval.');
  }
}

export const POST = withRequestTelemetry('memory_candidate.undo', undoCandidate);
