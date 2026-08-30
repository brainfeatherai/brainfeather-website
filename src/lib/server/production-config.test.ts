import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProductionConfiguration } from './production-config.ts';

const key = 'A'.repeat(43);

test('allows development without production storage credentials', () => {
  assert.doesNotThrow(() => validateProductionConfiguration({ NODE_ENV: 'development' }));
});

test('rejects production storage modes that can write plaintext', () => {
  assert.throws(
    () => validateProductionConfiguration({ NODE_ENV: 'production' }),
    /DATA_ENCRYPTION must be encrypted.*API_KEY_STORAGE must be hashed/,
  );
});

test('accepts explicit encrypted production configuration', () => {
  assert.doesNotThrow(() =>
    validateProductionConfiguration({
      NODE_ENV: 'production',
      BRAINFEATHER_DATA_ENCRYPTION: 'encrypted',
      BRAINFEATHER_DATA_ENCRYPTION_KEYS: `v1:${key}`,
      BRAINFEATHER_DATA_INDEX_KEY: key,
      BRAINFEATHER_API_KEY_STORAGE: 'hashed',
      BRAINFEATHER_SESSION_SECRET: 'session-secret-with-at-least-32-characters',
      BRAINFEATHER_RATE_LIMIT_SECRET: 'rate-limit-secret-with-at-least-32-characters',
    }),
  );
});

test('rejects duplicate or invalid encryption key ids at startup', () => {
  const base: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    BRAINFEATHER_DATA_INDEX_KEY: key,
    BRAINFEATHER_API_KEY_STORAGE: 'hashed',
    BRAINFEATHER_SESSION_SECRET: 'session-secret-with-at-least-32-characters',
    BRAINFEATHER_RATE_LIMIT_SECRET: 'rate-limit-secret-with-at-least-32-characters',
  };
  assert.throws(() => validateProductionConfiguration({
    ...base,
    BRAINFEATHER_DATA_ENCRYPTION: 'encrypted',
    BRAINFEATHER_DATA_ENCRYPTION_KEYS: `v1:${key},v1:${key}`,
  }), /ENCRYPTION_KEYS/);
  assert.throws(() => validateProductionConfiguration({
    ...base,
    BRAINFEATHER_DATA_ENCRYPTION: 'encrypted',
    BRAINFEATHER_DATA_ENCRYPTION_KEYS: `invalid.key:${key}`,
  }), /ENCRYPTION_KEYS/);
});
