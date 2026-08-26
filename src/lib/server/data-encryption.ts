import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

const ENVELOPE_PREFIX = 'bfe1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

type EncryptionContext = {
  userId: string;
  collection: string;
  documentId: string;
  field: string;
};

type EncryptionKey = {
  id: string;
  value: Buffer;
};

export type DataEncryptionMode = 'plaintext' | 'compatibility' | 'encrypted';

function decodeKey(value: string, label: string): Buffer {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(`[brainfeather] ${label} must be a base64url-encoded 32-byte key.`);
  }
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32) {
    throw new Error(`[brainfeather] ${label} must be a base64url-encoded 32-byte key.`);
  }
  return key;
}

function encryptionKeys(): EncryptionKey[] {
  const raw = process.env.BRAINFEATHER_DATA_ENCRYPTION_KEYS?.trim();
  if (!raw) {
    throw new Error(
      '[brainfeather] BRAINFEATHER_DATA_ENCRYPTION_KEYS is required when data encryption is enabled.',
    );
  }

  const seen = new Set<string>();
  return raw.split(',').map((entry) => {
    const separator = entry.indexOf(':');
    const id = entry.slice(0, separator).trim();
    const encoded = entry.slice(separator + 1).trim();
    if (separator < 1 || !/^[A-Za-z0-9_-]{1,16}$/.test(id) || !encoded) {
      throw new Error(
        '[brainfeather] Encryption keys must use keyId:base64url format.',
      );
    }
    if (seen.has(id)) throw new Error(`[brainfeather] Duplicate encryption key ID: ${id}.`);
    seen.add(id);
    return { id, value: decodeKey(encoded, `encryption key ${id}`) };
  });
}

function indexKey(): Buffer {
  const raw = process.env.BRAINFEATHER_DATA_INDEX_KEY?.trim();
  if (!raw) {
    throw new Error(
      '[brainfeather] BRAINFEATHER_DATA_INDEX_KEY is required when data encryption is enabled.',
    );
  }
  return decodeKey(raw, 'BRAINFEATHER_DATA_INDEX_KEY');
}

function derivedKey(master: Buffer, keyId: string, context: EncryptionContext): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      master,
      Buffer.from(context.userId),
      Buffer.from(
        `brainfeather\0${ENVELOPE_PREFIX}\0${keyId}\0${context.collection}\0${context.field}`,
      ),
      32,
    ),
  );
}

function additionalData(keyId: string, context: EncryptionContext): Buffer {
  return Buffer.from(
    [
      'brainfeather',
      ENVELOPE_PREFIX,
      keyId,
      context.userId,
      context.collection,
      context.documentId,
      context.field,
    ].join('\0'),
  );
}

export function dataEncryptionMode(): DataEncryptionMode {
  const mode = process.env.BRAINFEATHER_DATA_ENCRYPTION?.trim() || 'plaintext';
  if (mode !== 'plaintext' && mode !== 'compatibility' && mode !== 'encrypted') {
    throw new Error(
      '[brainfeather] BRAINFEATHER_DATA_ENCRYPTION must be plaintext, compatibility, or encrypted.',
    );
  }
  return mode;
}

export function dataEncryptionEnabled(): boolean {
  return dataEncryptionMode() === 'encrypted';
}

export function encryptedDataReadable(): boolean {
  return dataEncryptionMode() !== 'plaintext';
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(`${ENVELOPE_PREFIX}.`);
}

export function needsDataEncryption(value: string): boolean {
  if (!dataEncryptionEnabled() || !value) return false;
  return !value.startsWith(`${ENVELOPE_PREFIX}.${encryptionKeys()[0].id}.`);
}

export function encryptStoredValue(
  value: string,
  context: EncryptionContext,
  force = false,
): string {
  if (!value || (!force && !dataEncryptionEnabled())) return value;

  const active = encryptionKeys()[0];
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(
    ALGORITHM,
    derivedKey(active.value, active.id, context),
    iv,
    { authTagLength: TAG_BYTES },
  );
  cipher.setAAD(additionalData(active.id, context));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_PREFIX,
    active.id,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptStoredValue(value: string, context: EncryptionContext): string {
  if (!isEncryptedValue(value)) return value;
  if (!encryptedDataReadable()) {
    throw new Error(
      '[brainfeather] Encrypted data requires compatibility or encrypted mode.',
    );
  }

  const parts = value.split('.');
  if (parts.length !== 5) throw new Error('[brainfeather] Invalid encrypted data envelope.');
  const [, keyId, encodedIv, encodedTag, encodedCiphertext] = parts;
  const key = encryptionKeys().find((candidate) => candidate.id === keyId);
  if (!key) throw new Error(`[brainfeather] Missing data encryption key: ${keyId}.`);

  try {
    const iv = Buffer.from(encodedIv, 'base64url');
    const tag = Buffer.from(encodedTag, 'base64url');
    const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('invalid');

    const decipher = createDecipheriv(
      ALGORITHM,
      derivedKey(key.value, key.id, context),
      iv,
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(additionalData(key.id, context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('[brainfeather] Could not authenticate encrypted data.');
  }
}

export function blindIndex(value: string, userId: string, namespace: string): string {
  if (!encryptedDataReadable()) return value;
  return createHmac('sha256', indexKey())
    .update(['brainfeather', 'bfi1', userId, namespace, value].join('\0'))
    .digest('hex');
}

export function lookupValues(value: string, userId: string, namespace: string): string[] {
  if (!encryptedDataReadable()) return [value];
  const indexed = blindIndex(value, userId, namespace);
  return indexed === value ? [value] : [indexed, value];
}
