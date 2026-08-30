import Image from 'next/image';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getWaitlistRequest } from '@/lib/server/waitlist';
import { verifyWaitlistApprovalLink } from '@/lib/server/waitlist-approval';

export const metadata: Metadata = {
  title: 'Review access request',
  robots: { index: false, follow: false },
};

function value(input: string | string[] | undefined): string {
  return typeof input === 'string' ? input : '';
}

export default async function ApprovePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = value(params.status);
  const rowId = value(params.request);
  const expires = value(params.expires);
  const token = value(params.signature);
  const row = rowId ? await getWaitlistRequest(rowId).catch(() => null) : null;
  const valid = Boolean(
    row &&
      verifyWaitlistApprovalLink({
        rowId,
        email: row.email,
        expires,
        signature: token,
      }),
  );

  const completed = valid && (status === 'approved' || status === 'resent');
  const failed = status === 'email-error';
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-5 py-12">
      <section className="w-full max-w-lg overflow-hidden rounded-2xl border border-forest/10 bg-paper-dim shadow-[0_24px_70px_-48px_rgba(13,38,32,.55)]">
        <div className="flex items-center gap-2.5 border-b border-forest/10 px-7 py-5">
          <Image src="/logo-black.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          <span className="text-[18px] font-semibold tracking-tight text-forest">brainfeather</span>
        </div>
        <div className="px-7 py-9 sm:px-9">
          {completed ? (
            <>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">Access sent</p>
              <h1 className="mt-3 text-[30px] font-medium tracking-[-0.035em] text-forest">The invitation is on its way.</h1>
              <p className="mt-4 text-[14px] leading-7 text-forest/65">The request is approved and the applicant received a direct account link.</p>
              <Link href="/" className="mt-7 inline-flex rounded-full bg-forest px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-paper">Back to Brainfeather</Link>
            </>
          ) : !valid || !row ? (
            <>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700/70">Link unavailable</p>
              <h1 className="mt-3 text-[30px] font-medium tracking-[-0.035em] text-forest">This review link is invalid or expired.</h1>
              <p className="mt-4 text-[14px] leading-7 text-forest/65">Submit a new waitlist request to generate a fresh review link.</p>
            </>
          ) : (
            <>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">Waitlist review</p>
              <h1 className="mt-3 text-[30px] font-medium tracking-[-0.035em] text-forest">{row.approved ? 'Access is already approved.' : 'Approve this request?'}</h1>
              <p className="mt-4 text-[14px] leading-7 text-forest/65">{row.approved ? 'You can resend the direct account link if needed.' : 'This emails the applicant a direct account link, then confirms their access in Appwrite.'}</p>
              <div className="mt-6 rounded-xl border border-forest/10 bg-paper px-4 py-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/35">Email</p>
                <p className="mt-1 break-all text-[15px] font-medium text-forest">{row.email}</p>
              </div>
              {failed ? <p className="mt-4 text-[13px] leading-6 text-red-700">{row.approved ? 'Access is approved, but the email could not be sent. Try again to resend it.' : 'The email could not be sent, so access was not approved. Check the mail configuration and try again.'}</p> : null}
              {!row.approved ? <p className="mt-4 text-[12px] leading-5 text-forest/50">Use this button to approve access. Editing the Appwrite row directly bypasses email delivery.</p> : null}
              <form action="/api/public/approve" method="post" className="mt-7">
                <input type="hidden" name="request" value={rowId} />
                <input type="hidden" name="expires" value={expires} />
                <input type="hidden" name="signature" value={token} />
                <button type="submit" className="w-full rounded-full bg-forest px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-paper transition-transform hover:scale-[1.01]">
                  {row.approved ? 'Resend access email' : 'Approve and send access'}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
