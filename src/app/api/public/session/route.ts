import { authenticate } from '@/lib/server/api-auth';
import { approvedWaitlistRequest } from '@/lib/server/waitlist';

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return Response.json({ authenticated: false }, { status: auth.status });
  }
  if (auth.credential !== 'jwt') {
    return Response.json({ authenticated: false }, { status: 403 });
  }

  const inviteId = new URL(request.url).searchParams.get('invite');
  if (inviteId) {
    const invitation = await approvedWaitlistRequest(inviteId, auth.email).catch(() => null);
    if (!invitation) {
      return Response.json(
        {
          authenticated: false,
          error: 'Sign in with the email address that received this invitation.',
        },
        { status: 403, headers: { 'Cache-Control': 'no-store, private' } },
      );
    }
  }

  return Response.json(
    { authenticated: true },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
