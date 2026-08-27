"use server";

import { reportServerError } from "@/lib/server/report-error";
import { normalizeWaitlistEmail } from "@/lib/waitlist-email-address";
import { cookies } from "next/headers";
import { after } from "next/server";

/* ────────────────────────────────────────────────────────────────
   Waitlist capture.

   Flow: form → this Server Action → a row in the Appwrite `waitlist`
   table.

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
  const rawEmail = String(formData.get("email") ?? "").trim();
  const email = normalizeWaitlistEmail(rawEmail);

  /* Honeypot: a field hidden from people but happily filled by bots.
     Answer with the success copy rather than an error — telling a bot
     it was detected just teaches it to try again differently. */
  if (String(formData.get("website") ?? "").length > 0) {
    return { status: "ok", message: "You're on the list." };
  }

  if (!rawEmail) {
    return { status: "error", message: "Enter an email address." };
  }
  if (rawEmail.length > 254) {
    return { status: "error", message: "That address is too long." };
  }
  if (!EMAIL.test(rawEmail) || !EMAIL.test(email)) {
    return { status: "error", message: "That doesn't look like an email address." };
  }

  /* Writes to the Appwrite `waitlist` table.

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
    const { createWaitlistRequest, WAITLIST_COOKIE } = await import(
      "@/lib/server/waitlist"
    );

    /* The hidden `website` input is a HONEYPOT, not user data.
       tabIndex={-1}, off-screen, invisible to humans — so a non-empty
       value means a bot, and the check above has already returned a fake
       success and dropped it. By this line it is always empty. */
    const { request, created } = await createWaitlistRequest(email);
    const cookieStore = await cookies();
    cookieStore.set(WAITLIST_COOKIE, request.$id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });

    if (created) {
      after(async () => {
        try {
          const { sendWaitlistEmails } = await import("@/lib/server/waitlist-email");
          await sendWaitlistEmails(email, request.$id);
        } catch (error) {
          reportServerError(error, {
            operation: "waitlist.email",
            route: "/",
            tags: {
              gmail_configured: Boolean(process.env.GMAIL_APP_PASSWORD),
            },
          });
        }
      });
    }

    return {
      status: "ok",
      message: request.approved
        ? "Your access is approved. Create your account to continue."
        : "You're on the list. We'll be in touch.",
    };
  } catch (err) {
    /* Logged server-side with detail; the browser gets a sentence it can
       act on. Never surface the Appwrite error — it names collections and
       occasionally echoes configuration. */
    const appwriteError = err as { code?: unknown; type?: unknown };
    const code = typeof appwriteError.code === "number" ? appwriteError.code : undefined;
    const type = typeof appwriteError.type === "string" ? appwriteError.type : undefined;
    reportServerError(err, {
      operation: "waitlist.submit",
      route: "/",
      tags: { appwrite_code: code, appwrite_type: type },
    });
    if (process.env.NODE_ENV !== "production") {
      console.error(`[waitlist.submit] Appwrite code=${code ?? "unknown"} type=${type ?? "unknown"}`);
    }
    return {
      status: "error",
      message: "Couldn't save that. Try again in a moment?",
    };
  }
}
