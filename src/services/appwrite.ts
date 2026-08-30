import { account } from '@/lib/appwrite';
import { buildOAuthRedirectUrls, dashboardSessionPath } from '@/lib/invitation-auth';
import { OAuthProvider } from 'appwrite';

export class AccountApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// Auth services
export const authService = {
  async createEmailSession(email: string, password: string) {
    return await account.createEmailPasswordSession(email, password);
  },

  async createEmailPassword(email: string, password: string, name: string, inviteId: string) {
    const response = await fetch('/api/public/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, inviteId }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(body?.error ?? 'Could not create your Brainfeather account.');
    }
    return { email, name };
  },

  async getCurrentUser() {
    try {
      return await Promise.race([
        account.get(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('session-probe-timeout')), 8_000);
        }),
      ]);
    } catch {
      return null;
    }
  },

  async createJWT() {
    return await account.createJWT({ duration: 3600 });
  },

  signInWithGoogle(origin: string, inviteId?: string) {
    const { success, failure } = buildOAuthRedirectUrls(origin, inviteId);
    return account.createOAuth2Token({
      provider: OAuthProvider.Google,
      success,
      failure,
    });
  },

  /* The server access gate rejects OAuth sessions whose email has not
     been approved, so exposing Google here does not weaken invite-only access. */
  async completeOAuth(userId: string, secret: string) {
    return await account.createSession({ userId, secret });
  },

  async verifyDashboardSession(jwt: string, inviteId?: string) {
    const response = await fetch(dashboardSessionPath(inviteId), {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: 'no-store',
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new AccountApiError(
        response.status,
        body?.error ?? 'Could not verify dashboard access.',
      );
    }
    return body;
  },

  /* Idempotent profile row.

     createEmailPassword writes this document itself, but an OAuth signup
     never touches that path — Appwrite creates the auth account directly.
     Without this, a Google user has a session and no `users` row, so
     anything reading plan or memoriesCount gets a 404 for them.

     Caller treats a throw as non-fatal: a missing profile degrades the
     dashboard, but it should not block a valid session from signing in. */
  async ensureProfile(jwt: string) {
    const response = await fetch('/api/v1/account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new AccountApiError(
        response.status,
        body?.error ?? 'Could not provision your Brainfeather account.',
      );
    }
    return response.json();
  },

  async logout() {
    return await account.deleteSession('current');
  },

  async sendPasswordRecovery(email: string) {
    return await account.createRecovery(email, `${window.location.origin}/reset-password`);
  },

  async resetPassword(userId: string, secret: string, password: string) {
    return await account.updateRecovery(userId, secret, password);
  },
};

/* All application data access stays behind authenticated server routes.
   Browser SDK CRUD would rely entirely on external Appwrite permissions and
   bypass the server-side ownership and encryption boundary. */
