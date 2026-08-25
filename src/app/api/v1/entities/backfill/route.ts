import { authenticate, fail } from '@/lib/server/api-auth';
import { listAllActive, listEntities } from '@/lib/server/memory-store';
import { reportServerError } from '@/lib/server/report-error';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { enrichMemory } from '@/lib/server/think';

/* Repairs accounts whose memories predate graph enrichment. The work is
   idempotent: entities are upserted and mention edges are synchronized. */
async function backfillEntities(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  try {
    const memories = await listAllActive(auth.userId);
    let failed = 0;
    let firstError: unknown;

    for (const memory of memories) {
      try {
        await enrichMemory(auth.userId, memory.$id, memory.content);
      } catch (err) {
        failed++;
        firstError ??= err;
      }
    }

    if (failed > 0) {
      reportServerError(firstError, {
        operation: 'entity.backfill_partial',
        route: '/api/v1/entities/backfill',
        userId: auth.userId,
        tags: {
          failed_count: failed,
          processed_count: memories.length,
        },
      });
    }

    const entities = await listEntities(auth.userId);
    if (failed === memories.length && memories.length > 0) {
      return fail(500, 'Could not build the graph from existing memories.');
    }

    return Response.json({
      entities,
      count: entities.length,
      processed: memories.length,
      failed,
    });
  } catch (err) {
    reportServerError(err, {
      operation: 'entity.backfill',
      route: '/api/v1/entities/backfill',
      userId: auth.userId,
    });
    return fail(500, 'Could not build the graph from existing memories.');
  }
}

export const POST = withRequestTelemetry('entity.backfill', backfillEntities);
