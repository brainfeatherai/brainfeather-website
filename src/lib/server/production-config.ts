const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/;

export function validateProductionConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const productionDeployment =
    env.VERCEL_ENV === 'production' ||
    (env.NODE_ENV === 'production' && env.VERCEL !== '1');
  if (!productionDeployment) return;

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

  if (errors.length) {
    throw new Error(`[brainfeather] Unsafe production configuration: ${errors.join('; ')}.`);
  }
}
