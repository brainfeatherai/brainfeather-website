"use server";

/* ────────────────────────────────────────────────────────────────
   Waitlist capture.

   Flow: form → this Server Action → a Google Apps Script Web App →
   a row in your Google Sheet. See `scripts/waitlist-sheet.gs` for the
   script to deploy, and set WAITLIST_WEBHOOK_URL to its /exec URL.

   The webhook URL is a SERVER-ONLY env var — deliberately not
   NEXT_PUBLIC_, or it would ship to the browser and anyone could
   write rows into your sheet directly.

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

  const endpoint = process.env.WAITLIST_WEBHOOK_URL;

  /* Not configured — say so instead of showing a success message for
     something that was never recorded. The address is dropped here;
     claiming otherwise would be a lie to both of you. */
  if (!endpoint) {
    console.error(
      "[waitlist] WAITLIST_WEBHOOK_URL is not set — submission was NOT recorded.",
    );
    return {
      status: "error",
      /* Kept short because the form appends its own "Or email us."
         link — spelling out the mailto here read as a duplicate. */
      message: "Sign-ups aren't live yet.",
    };
  }

  const payload = {
    email,
    /* Only sent when configured. The Apps Script rejects a mismatch,
       so omitting this when the script HAS a secret set would fail
       every submission. */
    ...(process.env.WAITLIST_WEBHOOK_SECRET
      ? { secret: process.env.WAITLIST_WEBHOOK_SECRET }
      : {}),
    /* Two forms of the same instant: one sortable and unambiguous for
       machines, one readable in the sheet without a formula. */
    submittedAt: new Date().toISOString(),
    submittedAtReadable: new Date().toLocaleString("en-GB", {
      timeZone: "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    }),
    source: String(formData.get("source") ?? "website").slice(0, 60),
  };

  try {
    /* Apps Script answers a POST with a 302 to script.googleusercontent.com;
       fetch follows that by default, which is what we want. */
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!res.ok) {
      /* Log the status for us; never surface the endpoint or its
         response to the browser. */
      console.error(`[waitlist] webhook returned ${res.status}`);
      return {
        status: "error",
        message: "Something went wrong saving that. Try again in a moment?",
      };
    }

    return { status: "ok", message: "You're on the list. We'll be in touch." };
  } catch (err) {
    console.error("[waitlist] webhook request failed:", err);
    return {
      status: "error",
      message: "Couldn't reach the server. Try again in a moment?",
    };
  }
}
