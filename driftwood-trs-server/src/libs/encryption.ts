import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';
import { config } from './config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const key = config.AI_PROVIDER_CONFIG_ENCRYPTION_KEY;
  if (!key) {
    throw new InternalServerErrorException(
      'AI_PROVIDER_CONFIG_ENCRYPTION_KEY is not configured — cannot store or read provider API keys',
    );
  }

  const buffer = Buffer.from(key, 'hex');
  if (buffer.length !== 32) {
    throw new InternalServerErrorException(
      'AI_PROVIDER_CONFIG_ENCRYPTION_KEY must decode to 32 bytes (a 64-character hex string)',
    );
  }

  return buffer;
}

/** Encrypts a plaintext secret at rest. Output format: `iv:authTag:ciphertext` (all hex). */
export function encryptSecret(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/** Decrypts a value produced by `encryptSecret`. */
export function decryptSecret(payload: string): string {
  const [ivHex, authTagHex, ciphertextHex] = payload.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new InternalServerErrorException('Stored secret is not in the expected encrypted format');
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

/** Last 4 characters of a secret, safe to display/store alongside the ciphertext. */
export function lastFourOf(secret: string): string {
  return secret.slice(-4);
}
