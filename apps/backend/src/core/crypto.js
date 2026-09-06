import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { config } from './config.js';

/**
 * Cryptographic utilities conforming to docs/12.PRIVACY-SECURITY.md Section 7, 8, 24
 * Pure JavaScript using Node.js built-in crypto module.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Derives a 32-byte key from app secret for AES-256-GCM encryption.
 */
function getEncryptionKey(customKey) {
  const secret =
    customKey || config.jwtSecret || 'workaholic-default-encryption-key-must-be-changed-in-prod';
  return createHash('sha256').update(secret).digest();
}

/**
 * Generates a cryptographically secure random raw session token (256-bit entropy).
 * @returns {string} 64-character hexadecimal string
 */
export function generateSessionToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Generates a cryptographic SHA-256 hash of a raw token for safe database persistence.
 * Raw tokens must NEVER be stored directly in PostgreSQL.
 * @param {string} rawToken
 * @returns {string} 64-character hexadecimal SHA-256 digest
 */
export function hashSessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new TypeError('Raw token string is required for hashing');
  }
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Generates a cryptographically secure random state parameter for OAuth CSRF prevention.
 * @returns {string} 48-character hexadecimal string
 */
export function generateOAuthState() {
  return randomBytes(24).toString('hex');
}

/**
 * Encrypts sensitive credentials (e.g. OAuth refresh tokens) using AES-256-GCM.
 * @param {object|string} data - Plaintext object or string
 * @param {string} [customKey] - Optional override key
 * @returns {string} Base64 encoded payload containing IV, authTag, and ciphertext
 */
export function encryptCredentials(data, customKey) {
  const key = getEncryptionKey(customKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  const bundle = {
    iv: iv.toString('hex'),
    authTag,
    ciphertext,
  };

  return Buffer.from(JSON.stringify(bundle)).toString('base64');
}

/**
 * Decrypts sensitive credentials encrypted with encryptCredentials.
 * @param {string} base64Payload - Base64 encoded encrypted bundle
 * @param {string} [customKey] - Optional override key
 * @returns {any} Decrypted string or parsed object
 */
export function decryptCredentials(base64Payload, customKey) {
  if (!base64Payload || typeof base64Payload !== 'string') {
    throw new TypeError('Encrypted payload must be a string');
  }

  const key = getEncryptionKey(customKey);
  const decoded = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
  const { iv, authTag, ciphertext } = decoded;

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}
