import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import { readRequestAnalytics } from '@/lib/server/request-telemetry';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const rawDays = Number(new URL(request.url).searchParams.get('days'));
  const windowDays = Number.isFinite(rawDays)
    ? Math.min(Math.max(Math.floor(rawDays), 1), 90)
    : 30;

  try {
    return Response.json(await readRequestAnalytics(auth.userId, windowDays), {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch {
    return fail(500, 'Could not load request analytics.');
  }
}
