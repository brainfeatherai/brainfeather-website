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
import LoginView from "@/components/LoginView";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // A promise in this Next version — see docs/01-app/.../page.md.
  const { error } = await searchParams;

  // Repeated params arrive as an array, which is not the flag we set.
  return <LoginView oauthFailed={error === "oauth"} />;
}
