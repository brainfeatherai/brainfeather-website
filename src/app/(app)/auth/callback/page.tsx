/* ────────────────────────────────────────────────────────────────
   /auth/callback — second half of the OAuth token flow.

   Appwrite sends the browser here with `userId` and `secret` on the
   query string. Those get exchanged for a session by the client half,
   because the exchange has to happen from THIS origin for the SDK's
   localStorage fallback to engage when the cross-site cookie is refused.

   Server component purely to read `searchParams` (a Promise in this
   Next version) and hand the values down, matching /login.
   ──────────────────────────────────────────────────────────────── */

import type { Metadata } from "next";
import OAuthCallback from "@/components/OAuthCallback";

export const metadata: Metadata = {
  title: "Signing in",
};

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { userId, secret } = await searchParams;

  // Repeated params arrive as arrays; only a single string is valid here.
  return (
    <OAuthCallback
      userId={typeof userId === "string" ? userId : null}
      secret={typeof secret === "string" ? secret : null}
    />
  );
}
