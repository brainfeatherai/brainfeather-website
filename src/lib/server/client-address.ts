/* ────────────────────────────────────────────────────────────────
   One client-address resolver for every public, throttled endpoint.

   Both callers previously took `X-Forwarded-For.split(',')[0]` — the
   LEFT-most entry, which is the part a client supplies. On a platform
   that appends rather than overwrites, rotating that header hands an
   attacker unlimited rate-limit buckets on the two endpoints that
   create Appwrite accounts and rows.

   Vercel documents that it overwrites X-Forwarded-For and does not
   forward external IPs, so the live exposure is limited — but the
   ordering was backwards regardless: the platform-authoritative header
   was consulted only as a fallback. Precedence here is
   x-vercel-forwarded-for (never rewritten by a proxy in front of
   Vercel), then x-real-ip, then the RIGHT-most X-Forwarded-For entry,
   which is the one the nearest trusted proxy appended.

   Returns 'unknown' rather than throwing. The value is only ever an
   HMAC input for a rate-limit bucket id, so an unidentifiable caller
   should share one conservative bucket, not bypass the limit.
   ──────────────────────────────────────────────────────────────── */

export function clientAddress(source: Headers): string {
  const vercel = source.get('x-vercel-forwarded-for')?.trim();
  if (vercel) return vercel;

  const real = source.get('x-real-ip')?.trim();
  if (real) return real;

  /* Right-most, not left-most: everything to its left is client-supplied
     and therefore forgeable. */
  const forwarded = source.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }

  return 'unknown';
}
