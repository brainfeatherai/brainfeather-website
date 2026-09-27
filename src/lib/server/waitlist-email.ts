import 'server-only';

import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { CONTACT_EMAIL, SITE_URL } from '../site.ts';
import {
  normalizeWaitlistEmail,
  waitlistEmailsMatch,
} from '../waitlist-email-address.ts';
import { createWaitlistApprovalLink } from './waitlist-approval.ts';

const BRAND_NAME = 'Brainfeather';
const LOGO_URL = `${SITE_URL}/logo-black.png`;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function emailShell({
  eyebrow,
  title,
  body,
  detail,
  action,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  detail?: string;
  action: { href: string; label: string };
  compact?: boolean;
}): string {
  const outerPadding = compact ? '24px 12px' : '36px 16px';
  const maxWidth = compact ? '520px' : '600px';
  const headerPadding = compact ? '20px 26px' : '28px 34px 24px';
  const contentPadding = compact ? '28px 26px 30px' : '38px 34px 40px';
  const titleSize = compact ? '26px' : '34px';
  const bodySize = compact ? '14px' : '16px';
  const footerPadding = compact ? '16px 26px' : '20px 34px';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light only">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f3f1e8;color:#173c32;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1e8;padding:${outerPadding};">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${maxWidth};overflow:hidden;border:1px solid #d6ddd6;border-radius:16px;background:#fbf9f1;">
            <tr>
              <td style="padding:${headerPadding};border-bottom:1px solid #dfe4dd;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${LOGO_URL}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;object-fit:contain;">
                    </td>
                    <td style="padding-left:10px;vertical-align:middle;font-size:18px;font-weight:700;letter-spacing:-0.3px;color:#173c32;">
                      brainfeather
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:${contentPadding};">
                <p style="margin:0 0 10px;color:#348061;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
                <h1 style="margin:0;color:#173c32;font-size:${titleSize};font-weight:600;line-height:1.18;letter-spacing:-0.7px;">${escapeHtml(title)}</h1>
                <p style="margin:16px 0 0;color:#536b63;font-size:${bodySize};line-height:1.65;">${body}</p>
                ${detail ? `<div style="margin-top:20px;padding:14px 16px;border:1px solid #dce4dc;border-radius:10px;background:#eef4ef;color:#23483d;font-size:13px;line-height:1.5;">${detail}</div>` : ''}
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;">
                  <tr>
                    <td style="border-radius:999px;background:#173c32;">
                      <a href="${escapeHtml(action.href)}" style="display:inline-block;padding:12px 18px;color:#fbf9f1;font-size:11px;font-weight:700;letter-spacing:.8px;text-decoration:none;text-transform:uppercase;">${escapeHtml(action.label)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:${footerPadding};background:#173c32;color:#b9c9c2;font-size:11px;line-height:1.6;">
                Long-term memory for AI agents · <a href="${SITE_URL}" style="color:#d8e7df;text-decoration:none;">brainfeather.com</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildWaitlistEmails(applicantEmail: string, reviewUrl = `${SITE_URL}/approve`) {
  const realEmail = normalizeWaitlistEmail(applicantEmail);
  const safeEmail = escapeHtml(realEmail);
  return {
    owner: {
      from: `"${BRAND_NAME}" <${CONTACT_EMAIL}>`,
      to: CONTACT_EMAIL,
      replyTo: realEmail,
      subject: `Waitlist request · ${realEmail}`,
      text: `A new Brainfeather access request is ready for review.\n\nEmail: ${realEmail}\n\nReview request: ${reviewUrl}`,
      html: emailShell({
        eyebrow: 'Waitlist',
        title: 'New access request',
        body: 'A request was saved and is ready for review.',
        detail: `<span style="color:#6c8179;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Email</span><br><a href="mailto:${encodeURIComponent(realEmail)}" style="color:#173c32;font-size:15px;font-weight:600;text-decoration:none;word-break:break-word;">${safeEmail}</a>`,
        action: { href: reviewUrl, label: 'Review request' },
        compact: true,
      }),
    },
    applicant: {
      from: `"${BRAND_NAME}" <${CONTACT_EMAIL}>`,
      to: realEmail,
      replyTo: CONTACT_EMAIL,
      subject: "You're on the Brainfeather waitlist",
      text: `Thanks for joining the Brainfeather waitlist. Your request is saved, and we will email you when access is ready. You do not need to submit again.\n\nLearn more: ${SITE_URL}`,
      html: emailShell({
        eyebrow: 'Request received',
        title: "You're on the list.",
        body: "Thanks for joining Brainfeather. Your request is saved, and we'll email you when your access is ready. You do not need to submit again.",
        detail: '<strong style="color:#173c32;">What happens next?</strong><br>We are onboarding testers in small groups so every early user gets a reliable setup.',
        action: { href: SITE_URL, label: 'Explore Brainfeather' },
      }),
    },
  };
}

export function buildWaitlistApprovalEmail(applicantEmail: string, requestId: string) {
  const realEmail = normalizeWaitlistEmail(applicantEmail);
  const accountUrl = `${SITE_URL}/login?invite=${encodeURIComponent(requestId)}`;
  return {
    from: `"${BRAND_NAME}" <${CONTACT_EMAIL}>`,
    to: realEmail,
    replyTo: CONTACT_EMAIL,
    subject: 'Your Brainfeather access is ready',
    text: `Your Brainfeather access request has been approved. Sign in with the approved email, create your account, or continue with Google here: ${accountUrl}`,
    html: emailShell({
      eyebrow: 'Access approved',
      title: 'Your Brainfeather access is ready.',
      body: 'Sign in with the approved email, create your account, or continue with the approved Google account. After authentication, you will go directly to your dashboard.',
      detail: '<strong style="color:#173c32;">Use the same email address you requested access with.</strong><br>This invitation is linked to your approved waitlist request.',
      action: { href: accountUrl, label: 'Sign in to Brainfeather' },
    }),
  };
}

function mailTransport() {
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replaceAll(' ', '');
  if (!appPassword) {
    throw new Error('[brainfeather] GMAIL_APP_PASSWORD is not configured.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: CONTACT_EMAIL, pass: appPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export function assertRecipientAccepted(
  info: Pick<SMTPTransport.SentMessageInfo, 'accepted'>,
  recipient: string,
): void {
  const expected = normalizeWaitlistEmail(recipient);
  const accepted = info.accepted.some((address) => {
    const value = typeof address === 'string' ? address : address.address;
    return waitlistEmailsMatch(value, expected);
  });
  if (!accepted) {
    throw new Error('[brainfeather] SMTP did not accept the intended recipient.');
  }
}

export async function sendWaitlistEmails(applicantEmail: string, requestId: string): Promise<void> {
  const transporter = mailTransport();
  const reviewUrl = createWaitlistApprovalLink(requestId, applicantEmail);
  const messages = buildWaitlistEmails(normalizeWaitlistEmail(applicantEmail), reviewUrl);
  const results = await Promise.allSettled([
    transporter.sendMail(messages.owner),
    transporter.sendMail(messages.applicant),
  ]);
  transporter.close();

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      `[brainfeather] Failed to deliver ${failures.length} waitlist email(s).`,
    );
  }
}

export async function sendWaitlistApprovalEmail(
  applicantEmail: string,
  requestId: string,
): Promise<void> {
  const transporter = mailTransport();
  try {
    const message = buildWaitlistApprovalEmail(applicantEmail, requestId);
    const info = await transporter.sendMail(message);
    assertRecipientAccepted(info, message.to);
  } finally {
    transporter.close();
  }
}
