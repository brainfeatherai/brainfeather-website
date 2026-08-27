import { cookies } from 'next/headers';
import {
  approvedWaitlistRequest,
  getWaitlistRequest,
  WAITLIST_COOKIE,
} from '@/lib/server/waitlist';

const noStore = { 'Cache-Control': 'no-store, private' };

export async function GET() {
  const rowId = (await cookies()).get(WAITLIST_COOKIE)?.value ?? '';
  if (!rowId) {
    return Response.json({ status: 'none' }, { headers: noStore });
  }

  try {
    if (await approvedWaitlistRequest(rowId)) {
      return Response.json({ status: 'approved' }, { headers: noStore });
    }
    const request = await getWaitlistRequest(rowId);
    return Response.json(
      { status: request ? 'pending' : 'none' },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: noStore },
    );
  }
}
