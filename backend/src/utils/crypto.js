'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

/**
 * Derive a 32-byte key from the TOKEN_ENCRYPTION_KEY env var.
 * The env var should be at least 32 characters (or a 64-char hex string).
 */
function getKey() {
  const keyEnv = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyEnv) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set');
  }

  // If the key is a 64-char hex string use it directly as 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(keyEnv)) {
    return Buffer.from(keyEnv, 'hex');
  }

  // Otherwise derive 32 bytes via SHA-256
  return crypto.createHash('sha256').update(keyEnv).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns a colon-separated hex string: iv:tag:ciphertext
 *
 * @param {string} text - Plaintext to encrypt
 * @returns {string}    - Hex-encoded encrypted string
 */
function encrypt(text) {
  if (!text) throw new Error('encrypt: text must be a non-empty string');

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Format: hex(iv):hex(tag):hex(ciphertext)
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * Decrypt a string produced by encrypt().
 *
 * @param {string} encryptedStr - Colon-separated hex string (iv:tag:ciphertext)
 * @returns {string}            - Original plaintext
 */
function decrypt(encryptedStr) {
  if (!encryptedStr) throw new Error('decrypt: encryptedStr must be a non-empty string');

  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('decrypt: invalid encrypted string format (expected iv:tag:ciphertext)');
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
