import { ID } from 'node-appwrite';
import { adminUsers } from '@/lib/server/appwrite-admin';
import { approvedWaitlistRequest } from '@/lib/server/waitlist';
import { normalizeWaitlistEmail } from '@/lib/waitlist-email-address';
import { consumePublicRateLimit } from '@/lib/server/public-rate-limit';
import { clientAddress } from '@/lib/server/client-address';
import { reportServerError } from '@/lib/server/report-error';

const EMAIL = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;
const DENIED = 'This email is not currently eligible for Brainfeather access.';

/* Creates real Appwrite accounts and does 1–2 admin lookups per call, so
   it is throttled like the waitlist action. Same conservative window as
   everything else public: 5 attempts per address per hour. Address
   resolution is shared with the waitlist so both endpoints agree on
   which forwarded header is trustworthy. */

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; name?: unknown; inviteId?: unknown }
    | null;
  const rawEmail = typeof body?.email === 'string' ? body.email.trim() : '';
  const email = normalizeWaitlistEmail(rawEmail);
  const password = typeof body?.password === 'string' ? body.password : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const inviteId = typeof body?.inviteId === 'string' ? body.inviteId.trim() : '';

  if (
    !EMAIL.test(rawEmail) ||
    !EMAIL.test(email) ||
    rawEmail.length > 254 ||
    password.length < 8 ||
    name.length < 1 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(inviteId)
  ) {
    return Response.json({ error: 'Invalid registration details.' }, { status: 400 });
  }

  try {
    if (!(await consumePublicRateLimit('register', clientAddress(request.headers)))) {
      return Response.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429 },
      );
    }
  } catch (error) {
    /* Fail closed on the throttling store itself, before any admin
       lookup, but do not reveal the backend state. */
    reportServerError(error, {
      operation: 'register.rate_limit',
      route: '/api/public/register',
    });
    return Response.json({ error: DENIED }, { status: 403 });
  }

  const invitation = await approvedWaitlistRequest(inviteId, email).catch((error: unknown) => {
    reportServerError(error, {
      operation: 'register.invitation_lookup',
      route: '/api/public/register',
    });
    return null;
  });
  if (!invitation) {
    return Response.json({ error: DENIED }, { status: 403 });
  }

  try {
    await adminUsers.create({ userId: ID.unique(), email, password, name: name.slice(0, 128) });
    return Response.json({ created: true }, { status: 201 });
  } catch (error) {
    /* The client message stays deliberately opaque — it must not reveal
       whether an account already exists — but the failure is reported
       server-side. Without this, an Appwrite outage was indistinguishable
       from a rejected applicant and nothing reached Sentry at all.
       409 is the expected "already registered" case, so it is tagged
       rather than treated as a fault. */
    const code = (error as { code?: unknown }).code;
    reportServerError(error, {
      operation: 'register.create_user',
      route: '/api/public/register',
      tags: {
        appwrite_code: typeof code === 'number' ? code : undefined,
        expected_conflict: code === 409,
      },
    });
    return Response.json({ error: DENIED }, { status: 403 });
  }
}
