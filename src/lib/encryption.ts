import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

/**
 * Derives a 256-bit key from the master encryption key using scrypt.
 */
function deriveKey(salt: Buffer): Buffer {
  const masterKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY environment variable is not set. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return scryptSync(masterKey, salt, KEY_LENGTH);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a Buffer containing: salt (32) + iv (16) + authTag (16) + ciphertext.
 */
export function encrypt(plaintext: string): Buffer {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: salt + iv + authTag + ciphertext
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

/**
 * Decrypts a Buffer that was encrypted with the encrypt() function.
 * Expects format: salt (32) + iv (16) + authTag (16) + ciphertext.
 */
export function decrypt(encryptedBuffer: Buffer): string {
  if (encryptedBuffer.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted data is too short to be valid');
  }

  const salt = encryptedBuffer.subarray(0, SALT_LENGTH);
  const iv = encryptedBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = encryptedBuffer.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = encryptedBuffer.subarray(
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );

  const key = deriveKey(salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Encrypts a string and returns it as a hex-encoded string (for JSON/DB storage).
 */
export function encryptToHex(plaintext: string): string {
  return encrypt(plaintext).toString('hex');
}

/**
 * Decrypts a hex-encoded encrypted string.
 */
export function decryptFromHex(hexString: string): string {
  return decrypt(Buffer.from(hexString, 'hex'));
}
