import 'server-only';

import nodemailer from 'nodemailer';
import { CONTACT_EMAIL, SITE_URL } from '../site.ts';

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
}: {
  eyebrow: string;
  title: string;
  body: string;
  detail?: string;
  action: { href: string; label: string };
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light only">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f3f1e8;color:#173c32;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1e8;padding:36px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;overflow:hidden;border:1px solid #d6ddd6;border-radius:20px;background:#fbf9f1;">
            <tr>
              <td style="padding:28px 34px 24px;border-bottom:1px solid #dfe4dd;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${LOGO_URL}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;object-fit:contain;">
                    </td>
                    <td style="padding-left:11px;vertical-align:middle;font-size:20px;font-weight:700;letter-spacing:-0.4px;color:#173c32;">
                      brainfeather
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:38px 34px 40px;">
                <p style="margin:0 0 14px;color:#348061;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
                <h1 style="margin:0;color:#173c32;font-size:34px;font-weight:500;line-height:1.12;letter-spacing:-1.1px;">${escapeHtml(title)}</h1>
                <p style="margin:22px 0 0;color:#536b63;font-size:16px;line-height:1.7;">${body}</p>
                ${detail ? `<div style="margin-top:24px;padding:16px 18px;border:1px solid #dce4dc;border-radius:12px;background:#eef4ef;color:#23483d;font-size:14px;line-height:1.55;">${detail}</div>` : ''}
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:30px;">
                  <tr>
                    <td style="border-radius:999px;background:#173c32;">
                      <a href="${escapeHtml(action.href)}" style="display:inline-block;padding:13px 22px;color:#fbf9f1;font-size:12px;font-weight:700;letter-spacing:1px;text-decoration:none;text-transform:uppercase;">${escapeHtml(action.label)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 34px;background:#173c32;color:#b9c9c2;font-size:12px;line-height:1.6;">
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

export function buildWaitlistEmails(applicantEmail: string) {
  const safeEmail = escapeHtml(applicantEmail);
  return {
    owner: {
      from: `"${BRAND_NAME}" <${CONTACT_EMAIL}>`,
      to: CONTACT_EMAIL,
      replyTo: applicantEmail,
      subject: 'New Brainfeather waitlist request',
      text: `A new person joined the Brainfeather waitlist.\n\nEmail: ${applicantEmail}\n\nOpen Appwrite and set approved to true when you are ready to invite them: https://cloud.appwrite.io/console`,
      html: emailShell({
        eyebrow: 'New waitlist request',
        title: 'Someone wants to try Brainfeather.',
        body: 'A new access request was saved to the waitlist. Reply to this email if you want to contact them directly.',
        detail: `<strong style="color:#173c32;">Applicant</strong><br><a href="mailto:${encodeURIComponent(applicantEmail)}" style="color:#348061;text-decoration:none;">${safeEmail}</a>`,
        action: { href: 'https://cloud.appwrite.io/console', label: 'Review in Appwrite' },
      }),
    },
    applicant: {
      from: `"${BRAND_NAME}" <${CONTACT_EMAIL}>`,
      to: applicantEmail,
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

export async function sendWaitlistEmails(applicantEmail: string): Promise<void> {
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replaceAll(' ', '');
  if (!appPassword) {
    throw new Error('[brainfeather] GMAIL_APP_PASSWORD is not configured.');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: CONTACT_EMAIL, pass: appPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  const messages = buildWaitlistEmails(applicantEmail);
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
