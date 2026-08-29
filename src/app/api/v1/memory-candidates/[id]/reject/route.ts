import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import {
  CandidateReviewError,
  rejectMemoryCandidate,
} from '@/lib/server/candidate-review';
import { reportServerError } from '@/lib/server/report-error';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';

const noStore = { 'Cache-Control': 'no-store, private' };

async function rejectCandidate(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const { id } = await params;
  try {
    const result = await rejectMemoryCandidate(auth.userId, id);
    return Response.json(result, { headers: noStore });
  } catch (error) {
    if (error instanceof CandidateReviewError) {
      return fail(error.status, error.message);
    }
    reportServerError(error, {
      operation: 'memory_candidate.reject',
      route: '/api/v1/memory-candidates/:id/reject',
      userId: auth.userId,
      resourceId: id,
    });
    return fail(500, 'Could not reject the memory candidate.');
  }
}

export const POST = withRequestTelemetry(
  'memory_candidate.reject',
  rejectCandidate,
);
