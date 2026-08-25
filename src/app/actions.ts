"use server";

import { reportServerError } from "@/lib/server/report-error";

/* ────────────────────────────────────────────────────────────────
   Waitlist capture.

   Flow: form → this Server Action → a row in the Appwrite `waitlist`
   collection.

   Previously posted to a Google Apps Script webhook gated on
   WAITLIST_WEBHOOK_URL. That variable was never set in production, so
   every submission on the live site hit the not-configured branch and
   was DROPPED — while an Appwrite `waitlist` collection already existed,
   with matching attributes, and nothing writing to it.

   Writes through the ADMIN client, so it works regardless of collection
   permissions. That matters: the public waitlist keeps working even
   while user-session access is still locked down.

   `scripts/waitlist-sheet.gs` is unused as of this change.

   Server Actions are reachable by direct POST, not only through this
   site's UI, so everything below is validated as untrusted input.
   ──────────────────────────────────────────────────────────────── */

export type WaitlistState = {
  status: "idle" | "ok" | "error";
  message: string;
};

/* Deliberately conservative rather than RFC-complete: one @, a dot in
   the domain, no whitespace. A regex cannot prove an address exists —
   only a confirmation email can — so this just filters obvious junk. */
const EMAIL = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  /* Honeypot: a field hidden from people but happily filled by bots.
     Answer with the success copy rather than an error — telling a bot
     it was detected just teaches it to try again differently. */
  if (String(formData.get("company") ?? "").length > 0) {
    return { status: "ok", message: "You're on the list." };
  }

  if (!email) {
    return { status: "error", message: "Enter an email address." };
  }
  if (email.length > 254) {
    return { status: "error", message: "That address is too long." };
  }
  if (!EMAIL.test(email)) {
    return { status: "error", message: "That doesn't look like an email address." };
  }

  /* Writes to the Appwrite `waitlist` collection.

     Was a POST to a Google Apps Script webhook, gated on
     WAITLIST_WEBHOOK_URL. That variable was never set in production, so
     the branch above returned "Sign-ups aren't live yet" and DROPPED the
     address — every submission on the live site, silently. Meanwhile a
     `waitlist` collection already existed in Appwrite with exactly the
     right attributes (email, company, source, submittedAt) and nothing
     writing to it.

     Appwrite is also the better target now the dashboard exists: one
     store, visible in the same console as everything else, and no second
     service to keep alive. `scripts/waitlist-sheet.gs` is unused as of
     this change.

     Imported DYNAMICALLY, not at module scope. appwrite-admin throws on
     import when APPWRITE_API_KEY is absent, and this module is reached
     from the landing page — a top-level import would take the whole
     homepage down over a missing env var instead of just failing this
     one form. */
  try {
    const { adminDb, DATABASE_ID, COLLECTIONS } = await import(
      "@/lib/server/appwrite-admin"
    );
    const { ID, Query } = await import("node-appwrite");

    /* Idempotent on email. Without this a double-click, or someone
       signing up twice weeks apart, produces duplicate rows — and the
       count becomes something you cannot trust. Reports success either
       way: from the visitor's side "you are on the list" is true. */
    const existing = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.waitlist, [
      Query.equal("email", email),
      Query.limit(1),
    ]);

    if (existing.documents.length) {
      return { status: "ok", message: "You're already on the list." };
    }

    /* No `company` written, despite the collection having the attribute
       and the form having the field. That input is a HONEYPOT —
       tabIndex={-1}, off-screen, invisible to humans — so a non-empty
       value means a bot, and the check above has already returned a fake
       success and dropped it. By this line it is always empty. Persisting
       it would imply we collect company data when we never receive any. */
    await adminDb.createDocument(DATABASE_ID, COLLECTIONS.waitlist, ID.unique(), {
      email,
      source: String(formData.get("source") ?? "website").slice(0, 64),
      submittedAt: new Date().toISOString(),
    });

    return { status: "ok", message: "You're on the list. We'll be in touch." };
  } catch (err) {
    /* Logged server-side with detail; the browser gets a sentence it can
       act on. Never surface the Appwrite error — it names collections and
       occasionally echoes configuration. */
    reportServerError(err, {
      operation: "waitlist.submit",
      route: "/",
    });
    return {
      status: "error",
      message: "Couldn't save that. Try again in a moment?",
    };
  }
}
