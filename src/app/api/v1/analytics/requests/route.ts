import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import { readRequestAnalytics } from '@/lib/server/request-telemetry';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  /* `Number(null)` is 0, which is finite — so a missing ?days= must be
     caught before the conversion or the clamp turns it into a 1-day
     window instead of falling back to 30. */
  const rawDays = new URL(request.url).searchParams.get('days');
  const parsedDays = rawDays === null ? NaN : Number(rawDays);
  const windowDays = Number.isFinite(parsedDays)
    ? Math.min(Math.max(Math.floor(parsedDays), 1), 90)
    : 30;

  try {
    return Response.json(await readRequestAnalytics(auth.userId, windowDays), {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch {
    return fail(500, 'Could not load request analytics.');
  }
}
