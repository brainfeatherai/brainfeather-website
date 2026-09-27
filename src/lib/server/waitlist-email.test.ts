import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTACT_EMAIL, SITE_URL } from '../site.ts';
import { normalizeWaitlistEmail } from '../waitlist-email-address.ts';
import {
  assertRecipientAccepted,
  buildWaitlistApprovalEmail,
  buildWaitlistEmails,
} from './waitlist-email.ts';

test('builds branded owner and applicant waitlist emails', () => {
  const applicant = 'person@example.com';
  const messages = buildWaitlistEmails(applicant);

  assert.equal(messages.owner.to, CONTACT_EMAIL);
  assert.equal(messages.owner.replyTo, applicant);
  assert.match(messages.owner.text, /ready for review/);
  assert.match(messages.owner.html, new RegExp(`${SITE_URL}/logo-black\\.png`));
  assert.match(messages.owner.html, /max-width:520px/);
  assert.match(messages.owner.html, /font-size:26px/);
  assert.match(messages.owner.html, />New access request</);
  assert.doesNotMatch(messages.owner.html, /Someone wants to try Brainfeather/);

  assert.equal(messages.applicant.to, applicant);
  assert.equal(messages.applicant.replyTo, CONTACT_EMAIL);
  assert.match(messages.applicant.subject, /waitlist/i);
  assert.match(messages.applicant.text, /do not need to submit again/i);
  assert.match(messages.applicant.html, /You&#039;re on the list\./);
});

test('escapes applicant-controlled content in the owner email', () => {
  const messages = buildWaitlistEmails('person+<tag>@example.com');
  assert.doesNotMatch(messages.owner.html, /person\+<tag>/);
  assert.match(messages.owner.html, /person\+&lt;tag&gt;@example\.com/);
});

test('shows and sends to the real Gmail mailbox instead of a test alias', () => {
  const alias = 'winopbusiness+brainfeather-123@gmail.com';
  const realEmail = normalizeWaitlistEmail(alias);
  const messages = buildWaitlistEmails(alias);

  assert.equal(realEmail, 'winopbusiness@gmail.com');
  assert.equal(messages.owner.replyTo, realEmail);
  assert.equal(messages.applicant.to, realEmail);
  assert.match(messages.owner.subject, /winopbusiness@gmail\.com/);
  assert.match(messages.owner.html, /winopbusiness@gmail\.com/);
  assert.doesNotMatch(messages.owner.html, /brainfeather-123/);
});

test('builds an approved-access email with a direct invitation link', () => {
  const message = buildWaitlistApprovalEmail(
    'person+test@gmail.com',
    'request_123',
  );
  assert.equal(message.to, 'person@gmail.com');
  assert.match(message.subject, /access is ready/i);
  assert.match(message.text, /\/login\?invite=request_123/);
  assert.doesNotMatch(message.text, /person%40gmail\.com/);
  assert.match(message.html, /Access approved/);
  assert.match(message.html, /Sign in to Brainfeather/);
  assert.match(message.html, /directly to your dashboard/);
});

test('requires SMTP to accept the intended approval recipient', () => {
  assert.doesNotThrow(() => {
    assertRecipientAccepted({ accepted: ['person@gmail.com'] }, 'Person+test@gmail.com');
  });
  assert.throws(
    () => assertRecipientAccepted({ accepted: ['other@example.com'] }, 'person@example.com'),
    /did not accept the intended recipient/,
  );
});
