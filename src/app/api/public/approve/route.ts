import { NextResponse } from 'next/server';
import { reportServerError } from '@/lib/server/report-error';
import { adminTables, COLLECTIONS, DATABASE_ID } from '@/lib/server/appwrite-admin';
import { getWaitlistRequest } from '@/lib/server/waitlist';
import { verifyWaitlistApprovalLink } from '@/lib/server/waitlist-approval';
import { sendWaitlistApprovalEmail } from '@/lib/server/waitlist-email';

function redirect(
  request: Request,
  status: string,
  review?: { rowId: string; expires: string; signature: string },
) {
  const target = new URL('/approve', request.url);
  target.searchParams.set('status', status);
  if (review) {
    target.searchParams.set('request', review.rowId);
    target.searchParams.set('expires', review.expires);
    target.searchParams.set('signature', review.signature);
  }
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const rowId = String(form.get('request') ?? '');
  const expires = String(form.get('expires') ?? '');
  const signature = String(form.get('signature') ?? '');
  const row = await getWaitlistRequest(rowId).catch(() => null);
  if (
    !row ||
    !verifyWaitlistApprovalLink({ rowId, email: row.email, expires, signature })
  ) {
    return redirect(request, 'invalid');
  }

  const alreadyApproved = row.approved === true;
  try {
    await sendWaitlistApprovalEmail(row.email, rowId);
    if (!alreadyApproved) {
      await adminTables.updateRow({
        databaseId: DATABASE_ID,
        tableId: COLLECTIONS.waitlist,
        rowId,
        data: { approved: true },
      });
    }
    return redirect(request, alreadyApproved ? 'resent' : 'approved', {
      rowId,
      expires,
      signature,
    });
  } catch (error) {
    reportServerError(error, {
      operation: 'waitlist.approve',
      route: '/api/public/approve',
      resourceId: rowId,
    });
    return redirect(request, 'email-error', { rowId, expires, signature });
  }
}
