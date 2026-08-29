import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import { readOverview } from '@/lib/server/overview';

const noStore = { 'Cache-Control': 'no-store, private' };

export async function GET(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  try {
    return Response.json(await readOverview(auth.userId), { headers: noStore });
  } catch {
    return fail(500, 'Could not load overview.');
  }
}
