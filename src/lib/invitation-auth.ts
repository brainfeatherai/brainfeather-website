export function buildOAuthRedirectUrls(origin: string, inviteId?: string) {
  const success = new URL('/auth/callback', origin);
  const failure = new URL('/login', origin);
  failure.searchParams.set('error', 'oauth');
  if (inviteId) {
    success.searchParams.set('invite', inviteId);
    failure.searchParams.set('invite', inviteId);
  }
  return { success: success.toString(), failure: failure.toString() };
}

export function dashboardSessionPath(inviteId?: string): string {
  return inviteId
    ? `/api/public/session?invite=${encodeURIComponent(inviteId)}`
    : '/api/public/session';
}
