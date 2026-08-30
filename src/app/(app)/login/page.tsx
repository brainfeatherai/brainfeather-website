/* ────────────────────────────────────────────────────────────────
   /login — server shell.

   Stays a server component purely so `searchParams` can be read here
   and handed down. The alternative was reading the OAuth failure flag
   from `window.location.search` inside an effect, which meant a
   setState during commit (eslint react-hooks/set-state-in-effect) and
   painted the form once before the error appeared.

   The form itself is LoginView — client, because the Appwrite web SDK
   has to open the session in the browser.

   `title` only: the group layout already sets robots noindex, and the
   root layout's template appends the brand.
   ──────────────────────────────────────────────────────────────── */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import LoginView from "@/components/LoginView";
import {
  approvedWaitlistRequest,
  WAITLIST_COOKIE,
} from "@/lib/server/waitlist";

export const metadata: Metadata = {
  title: "Console access",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    invite?: string | string[];
    error?: string | string[];
  }>;
}) {
  const { invite, error } = await searchParams;
  const cookieInvite = (await cookies()).get(WAITLIST_COOKIE)?.value;
  const candidate = typeof invite === "string" ? invite : cookieInvite;
  const approved = candidate
    ? await approvedWaitlistRequest(candidate).catch(() => null)
    : null;
  const initialError =
    error === 'access'
      ? 'This Google account has not been approved for Brainfeather access.'
      : error === 'invite'
        ? 'Sign in with the same email address that received this invitation.'
      : error === 'oauth'
        ? 'Google sign-in could not be completed. Try again.'
        : null;
  return (
    <LoginView
      inviteId={approved?.$id ?? null}
      inviteEmail={approved?.email ?? null}
      initialError={initialError}
    />
  );
}
