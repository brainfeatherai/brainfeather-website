import { createHash, randomBytes } from 'node:crypto';

const HASH_PREFIX = 'sha256:';
const TOKEN_PREFIX = 'bf_live_';
const TOKEN_PATTERN = /^bf_(?:(?:live|test)_[A-Za-z0-9]{16,128}|[A-Fa-f0-9]{16,128})$/;

export function createApiKey(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
}

export function apiKeyHashWritesEnabled(): boolean {
  return process.env.BRAINFEATHER_API_KEY_STORAGE === 'hashed';
}

export function isBrainfeatherApiKey(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function apiKeyDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Store a digest plus four non-secret display characters, never the token. */
export function storedApiKey(token: string): string {
  const environment = token.startsWith('bf_test_')
    ? 'test'
    : token.startsWith('bf_live_')
      ? 'live'
      : 'legacy';
  return `${HASH_PREFIX}${apiKeyDigest(token)}:${environment}:${token.slice(-4)}`;
}

/** Digest shape used by the first hashing rollout. Keep readable until all
 * rows have been normalized to the environment-aware format. */
export function legacyStoredApiKey(token: string): string {
  return `${HASH_PREFIX}${apiKeyDigest(token)}:${token.slice(-4)}`;
}

export function isHashedApiKey(value: string): boolean {
  return (
    /^sha256:[a-f0-9]{64}:(?:live|test|legacy):[A-Za-z0-9]{4}$/.test(value) ||
    /^sha256:[a-f0-9]{64}:[A-Za-z0-9]{4}$/.test(value)
  );
}

export function apiKeyHint(value: string): string {
  if (!isHashedApiKey(value)) {
    const prefix = value.startsWith('bf_test_') ? 'bf_test_' : TOKEN_PREFIX;
    return `${prefix}...${value.slice(-4)}`;
  }
  const parts = value.split(':');
  if (parts.length === 3) return `bf_...${parts[2]}`;
  const [, , environment, suffix] = parts;
  return environment === 'legacy'
    ? `bf_...${suffix}`
    : `bf_${environment}_...${suffix}`;
}

export function apiKeySlotId(userId: string, slot: number): string {
  return createHash('sha256')
    .update(`${userId}\0api-key-slot\0${slot}`)
    .digest('hex')
    .slice(0, 36);
}
