const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/;

export function validateProductionConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const productionDeployment =
    env.VERCEL_ENV === 'production' ||
    (env.NODE_ENV === 'production' && env.VERCEL !== '1');

  /* Previews are exempt from the checks below so a branch can boot
     without production secrets. That exemption is keyed on deployment
     type, not on which database is being written to — so a preview
     sharing the production Appwrite project would write plaintext rows
     and plaintext blind indexes into an encrypted store, which is
     expensive to detect and worse to repair.

     Whether preview and production share NEXT_PUBLIC_APPWRITE_PROJECT_ID
     is a dashboard fact this code cannot read, so this warns rather than
     throws: failing closed here would break every preview deployment,
     including safe ones. Confirm the env scoping in Vercel; if previews
     do share the production project, they need their own project. */
  if (!productionDeployment) {
    if (env.VERCEL_ENV === 'preview' && env.BRAINFEATHER_DATA_ENCRYPTION !== 'encrypted') {
      console.warn(
        '[brainfeather] Preview deployment is running with data encryption disabled. ' +
          'If this deployment shares the production Appwrite project, it will write ' +
          'plaintext rows into the encrypted store.',
      );
    }
    return;
  }

  const errors: string[] = [];
  if (env.BRAINFEATHER_DATA_ENCRYPTION !== 'encrypted') {
    errors.push('BRAINFEATHER_DATA_ENCRYPTION must be encrypted');
  }
  if (env.BRAINFEATHER_API_KEY_STORAGE !== 'hashed') {
    errors.push('BRAINFEATHER_API_KEY_STORAGE must be hashed');
  }

  const keys = env.BRAINFEATHER_DATA_ENCRYPTION_KEYS?.split(',') ?? [];
  const keyIds = new Set<string>();
  if (
    !keys.length ||
    keys.some((entry) => {
      const separator = entry.indexOf(':');
      const id = entry.slice(0, separator);
      const invalid =
        separator < 1 ||
        !/^[A-Za-z0-9_-]{1,16}$/.test(id) ||
        keyIds.has(id) ||
        !BASE64URL_32.test(entry.slice(separator + 1));
      keyIds.add(id);
      return invalid;
    })
  ) {
    errors.push('BRAINFEATHER_DATA_ENCRYPTION_KEYS must contain keyId:base64url-32-byte keys');
  }
  if (!BASE64URL_32.test(env.BRAINFEATHER_DATA_INDEX_KEY ?? '')) {
    errors.push('BRAINFEATHER_DATA_INDEX_KEY must be a base64url-encoded 32-byte key');
  }
  if ((env.BRAINFEATHER_SESSION_SECRET?.length ?? 0) < 32) {
    errors.push('BRAINFEATHER_SESSION_SECRET must contain at least 32 characters');
  }
  if ((env.BRAINFEATHER_RATE_LIMIT_SECRET?.length ?? 0) < 32) {
    errors.push('BRAINFEATHER_RATE_LIMIT_SECRET must contain at least 32 characters');
  }
  /* Warns, and deliberately does not join `errors`. This function runs at
     server boot from instrumentation.ts, so anything pushed here takes the
     site down. WAITLIST_APPROVAL_SECRET is not currently set in Vercel —
     approval links are signed with APPWRITE_API_KEY via the documented
     fallback in waitlist-approval.ts — so promoting this to a hard error
     would turn a hardening task into an outage. Set the variable, confirm
     the warning stops, then make it fatal. */
  if ((env.WAITLIST_APPROVAL_SECRET?.length ?? 0) < 32) {
    console.warn(
      '[brainfeather] WAITLIST_APPROVAL_SECRET is not set (needs 32+ characters). ' +
        'Waitlist approval links are being signed with APPWRITE_API_KEY, so rotating ' +
        'that key will invalidate every outstanding approval email.',
    );
  }

  if (errors.length) {
    throw new Error(`[brainfeather] Unsafe production configuration: ${errors.join('; ')}.`);
  }
}
