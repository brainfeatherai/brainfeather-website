/**
 * Brainfeather — waitlist capture into a Google Sheet.
 *
 * This is Google Apps Script, NOT part of the Next.js build. It is
 * kept in the repo so the receiving end is version-controlled next to
 * the code that posts to it.
 *
 * ── Setup ──────────────────────────────────────────────────────────
 *  1. Create a Google Sheet. From it: Extensions → Apps Script.
 *  2. Replace the default Code.gs with this file's contents. Save.
 *  3. Deploy → New deployment → type "Web app".
 *       Execute as:      Me
 *       Who has access:  Anyone            <- required; see note below
 *  4. Deploy, authorise when prompted, and copy the /exec URL.
 *  5. Put that URL in .env.local as WAITLIST_WEBHOOK_URL (no quotes).
 *  6. Restart `npm run dev`, then submit the form once to verify.
 *
 * ── About "Anyone" ─────────────────────────────────────────────────
 * A public web app is the only way an unauthenticated server can post
 * here. That means anyone who learns the URL can append rows, so:
 *  · keep the URL server-side only (never NEXT_PUBLIC_*),
 *  · treat the sheet as append-only input you still validate,
 *  · rotate it (Deploy → Manage deployments → Archive) if it leaks.
 * SHARED_SECRET below narrows that gap.
 *
 * ── Optional shared secret ─────────────────────────────────────────
 * Set SHARED_SECRET to a long random string, and set the same value as
 * WAITLIST_WEBHOOK_SECRET in .env.local. Requests without it are then
 * rejected. Leave it "" to skip the check.
 */

var SHEET_NAME = 'Waitlist';
var SHARED_SECRET = '';

/**
 * Send each new signup a confirmation from the account running this
 * script. Set false to record silently.
 *
 * QUOTA: a free consumer Gmail account can send to 100 recipients per
 * day (Google Workspace: 1,500). One confirmation per signup, so ~100
 * signups/day. Beyond that the send throws — the row is still saved
 * (see the try/catch in sendConfirmation_) and column 5 records the
 * failure so nobody is silently lost.
 */
var SEND_CONFIRMATION = true;

/** Shown as the From name. The address is the account's own. */
var FROM_NAME = 'Brainfeather';

var HEADERS = [
  'Timestamp (UTC)',
  'Readable (UTC)',
  'Email',
  'Source',
  'Confirmation',
];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'empty body' });
    }

    var body = JSON.parse(e.postData.contents);

    if (SHARED_SECRET && body.secret !== SHARED_SECRET) {
      return json({ ok: false, error: 'unauthorised' });
    }

    var email = String(body.email || '').trim().toLowerCase();
    if (!email || email.indexOf('@') === -1) {
      return json({ ok: false, error: 'invalid email' });
    }

    // "Check, then append" is two operations; without a lock two
    // near-simultaneous submissions of the SAME address can both see
    // "not present" and both append. Apps Script runs concurrent
    // executions, so this is a real race, not a theoretical one.
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) {
      return json({ ok: false, error: 'busy, retry' });
    }

    try {
      return record_(email, body);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** Everything that touches the sheet. Runs under the script lock. */
function record_(email, body) {
  var sheet = getSheet();

  // Idempotent: re-submitting the same address adds nothing, so a
  // double-click can't produce a duplicate row.
  if (findEmailRow(sheet, email) !== -1) {
    return json({ ok: true, duplicate: true });
  }

  // Record FIRST, notify second. If the send fails (quota, bad
  // address) the signup is already safely in the sheet.
  sheet.appendRow([
    body.submittedAt || new Date().toISOString(),
    body.submittedAtReadable || '',
    email,
    body.source || 'website',
    SEND_CONFIRMATION ? 'pending' : 'off',
  ]);

  if (SEND_CONFIRMATION) {
    var outcome = sendConfirmation_(email);
    sheet.getRange(sheet.getLastRow(), 5).setValue(outcome);
  }

  return json({ ok: true });
}

/**
 * Apps Script serves GET to browsers; answer plainly so hitting the
 * URL by hand tells you the deployment is live without leaking data.
 */
function doGet() {
  return json({ ok: true, service: 'brainfeather-waitlist' });
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/** Column 3 is Email. Returns the row index, or -1. */
function findEmailRow(sheet, email) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;

  var values = sheet.getRange(2, 3, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === email) {
      return i + 2;
    }
  }
  return -1;
}

/**
 * Confirmation email to the person who just signed up.
 *
 * Returns a short status string for column 5 — never throws, because a
 * failed send must not lose a signup that's already in the sheet.
 * MailApp.getRemainingDailyQuota() is checked first so a quota wall is
 * recorded as such rather than as an opaque error.
 */
function sendConfirmation_(email) {
  try {
    if (MailApp.getRemainingDailyQuota() < 1) {
      return 'not sent: daily quota exhausted';
    }

    var subject = "You're on the Brainfeather list";
    var body =
      'Thanks for signing up to Brainfeather.\n\n' +
      "You're on the early-access list. We'll email you when there's " +
      'something to try — one message, not a newsletter.\n\n' +
      'Brainfeather is long-term memory for AI coding agents: it records ' +
      'the facts that matter about your project and hands them back to ' +
      'Claude Code, Cursor or your own agents on the next run.\n\n' +
      'Reply to this email any time — including to ask us to remove your ' +
      'address, which we will do straight away.\n\n' +
      '— Brainfeather';

    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      name: FROM_NAME,
    });

    return 'sent ' + new Date().toISOString();
  } catch (err) {
    return 'not sent: ' + String(err).slice(0, 90);
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
