import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import { readOverview } from '@/lib/server/overview';
import { PREFERRED_REGION } from '@/lib/server/region';

const noStore = { 'Cache-Control': 'no-store, private' };

export const preferredRegion = PREFERRED_REGION;
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  try {
    return Response.json(await readOverview(auth.userId), { headers: noStore });
  } catch {
    return fail(500, 'Could not load overview.');
  }
}
