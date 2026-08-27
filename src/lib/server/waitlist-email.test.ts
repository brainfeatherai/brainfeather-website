import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTACT_EMAIL, SITE_URL } from '../site.ts';
import { buildWaitlistEmails } from './waitlist-email.ts';

test('builds branded owner and applicant waitlist emails', () => {
  const applicant = 'person@example.com';
  const messages = buildWaitlistEmails(applicant);

  assert.equal(messages.owner.to, CONTACT_EMAIL);
  assert.equal(messages.owner.replyTo, applicant);
  assert.match(messages.owner.text, /set approved to true/);
  assert.match(messages.owner.html, new RegExp(`${SITE_URL}/logo-black\\.png`));

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
