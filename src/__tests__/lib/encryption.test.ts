import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { encrypt, decrypt, encryptToHex, decryptFromHex } from '@/lib/encryption';

// Set a test encryption key before tests run
beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-only-32ch';
});

afterAll(() => {
  delete process.env.CREDENTIALS_ENCRYPTION_KEY;
});

describe('encryption', () => {
  describe('encrypt / decrypt round-trip', () => {
    it('encrypts and decrypts a simple string', () => {
      const plaintext = 'hello world';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts an empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts a long string', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts unicode characters', () => {
      const plaintext = 'Hello World! こんにちは 🌍 Ñoño àáâã';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts special characters and symbols', () => {
      const plaintext = 'p@$$w0rd!#%^&*()_+-={}[]|\\:";\'<>?,./~`';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext for the same plaintext (random IV/salt)', () => {
      const plaintext = 'test password';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      // The buffers should be different because of random salt+IV
      expect(encrypted1.equals(encrypted2)).toBe(false);
      // But both decrypt to the same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });
  });

  describe('encryptToHex / decryptFromHex round-trip', () => {
    it('encrypts to hex and decrypts back', () => {
      const plaintext = 'my-secret-password';
      const hexEncrypted = encryptToHex(plaintext);
      expect(typeof hexEncrypted).toBe('string');
      expect(/^[0-9a-f]+$/i.test(hexEncrypted)).toBe(true);
      const decrypted = decryptFromHex(hexEncrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('hex output is longer than plaintext (includes salt, iv, auth tag)', () => {
      const plaintext = 'short';
      const hexEncrypted = encryptToHex(plaintext);
      // salt(32) + iv(16) + authTag(16) + ciphertext(>=5) = >=69 bytes = >=138 hex chars
      expect(hexEncrypted.length).toBeGreaterThan(plaintext.length * 2);
    });
  });

  describe('tamper detection', () => {
    it('throws on truncated data', () => {
      const encrypted = encrypt('test');
      const truncated = encrypted.subarray(0, 10);
      expect(() => decrypt(truncated)).toThrow('Encrypted data is too short');
    });

    it('throws on corrupted ciphertext', () => {
      const encrypted = encrypt('test');
      // Flip a byte in the ciphertext area (after salt+iv+authTag = 64 bytes)
      if (encrypted.length > 65) {
        encrypted[65] = encrypted[65] ^ 0xff;
      }
      expect(() => decrypt(encrypted)).toThrow();
    });

    it('throws on corrupted auth tag', () => {
      const encrypted = encrypt('test');
      // Corrupt a byte in the auth tag area (bytes 48-63)
      encrypted[50] = encrypted[50] ^ 0xff;
      expect(() => decrypt(encrypted)).toThrow();
    });
  });

  describe('missing encryption key', () => {
    it('throws if CREDENTIALS_ENCRYPTION_KEY is not set', () => {
      const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
      delete process.env.CREDENTIALS_ENCRYPTION_KEY;

      expect(() => encrypt('test')).toThrow('CREDENTIALS_ENCRYPTION_KEY');

      // Restore
      process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
    });
  });
});
