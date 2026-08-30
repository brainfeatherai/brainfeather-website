import { authenticate } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return Response.json({ authenticated: false }, { status: auth.status });
  }
  if (auth.credential !== 'jwt') {
    return Response.json({ authenticated: false }, { status: 403 });
  }
  return Response.json(
    { authenticated: true },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
