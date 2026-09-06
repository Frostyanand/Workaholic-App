import { AuthenticationFailedError } from '../../core/errors.js';
import { config } from '../../core/config.js';

/**
 * Google Authentication & Identity Verification Service.
 * Conforms to docs/IMPLEMENTATION-PLAN.md Task 4.1, docs/12.PRIVACY-SECURITY.md Section 4 & 5,
 * and docs/19.INTEGRATION-SPECIFICATION.md Section 4.
 *
 * STRICT BOUNDARY:
 * Answers exclusively: "Who is this user?"
 * Does NOT request or grant Google API scopes (Calendar, Tasks, Drive).
 */
export class GoogleAuthService {
  constructor(options = {}) {
    this.clientId = options.clientId || config.googleClientId || '';
    this.allowedIssuers = ['https://accounts.google.com', 'accounts.google.com'];
  }

  /**
   * Safe base64url decoding
   */
  decodeBase64Url(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  /**
   * Parses and validates Google ID token JWT claims.
   *
   * @param {string} idToken - OpenID Connect JWT ID token
   * @param {string} [overrideClientId] - Optional expected audience
   * @returns {Promise<{ provider: 'GOOGLE', subject: string, email: string, emailVerified: boolean, displayName: string, picture: string|null }>}
   */
  async verifyGoogleIdToken(idToken, overrideClientId) {
    if (!idToken || typeof idToken !== 'string') {
      throw new AuthenticationFailedError('Google ID token is required');
    }

    const parts = idToken.trim().split('.');
    if (parts.length !== 3) {
      throw new AuthenticationFailedError('Malformed Google ID token');
    }

    let payload;
    try {
      const decodedPayload = this.decodeBase64Url(parts[1]);
      payload = JSON.parse(decodedPayload);
    } catch {
      throw new AuthenticationFailedError('Failed to parse Google ID token payload');
    }

    // 1. Validate Issuer
    if (!payload.iss || !this.allowedIssuers.includes(payload.iss)) {
      throw new AuthenticationFailedError(`Invalid token issuer: ${payload.iss || 'missing'}`);
    }

    // 2. Validate Expiration
    if (!payload.exp || typeof payload.exp !== 'number') {
      throw new AuthenticationFailedError('Token missing expiration claim');
    }

    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    // Allow 60s clock skew
    if (payload.exp < nowEpochSeconds - 60) {
      throw new AuthenticationFailedError('Google ID token has expired');
    }

    // 3. Validate Audience if configured
    const expectedAudience = overrideClientId || this.clientId;
    if (expectedAudience && payload.aud !== expectedAudience) {
      throw new AuthenticationFailedError(
        'Token audience does not match configured Google Client ID',
      );
    }

    // 4. Validate Subject Identifier
    if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
      throw new AuthenticationFailedError('Token missing valid subject identifier');
    }

    // 5. Validate Email and Email Verification
    if (!payload.email || typeof payload.email !== 'string') {
      throw new AuthenticationFailedError('Token missing email claim');
    }

    if (payload.email_verified !== true && payload.email_verified !== 'true') {
      throw new AuthenticationFailedError('Google email must be verified');
    }

    return {
      provider: 'GOOGLE',
      subject: String(payload.sub).trim(),
      email: String(payload.email).trim().toLowerCase(),
      emailVerified: true,
      displayName: payload.name || payload.email.split('@')[0],
      picture: payload.picture || null,
    };
  }
}

/**
 * Creates a valid test/mock Google ID token for automated testing.
 */
export function createMockGoogleIdToken(claims = {}) {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'mock-key-1' };
  const nowSec = Math.floor(Date.now() / 1000);

  const payload = {
    iss: 'https://accounts.google.com',
    sub: claims.sub || 'google_sub_1234567890',
    email: claims.email || 'alex@example.com',
    email_verified: claims.email_verified !== undefined ? claims.email_verified : true,
    name: claims.name || 'Alex Chen',
    picture: claims.picture || 'https://lh3.googleusercontent.com/a/mock-pic',
    aud: claims.aud || 'workaholic-google-client-id',
    iat: claims.iat || nowSec - 60,
    exp: claims.exp || nowSec + 3600,
    ...claims,
  };

  const toB64Url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${toB64Url(header)}.${toB64Url(payload)}.mock_signature_bytes`;
}

export const googleAuthService = new GoogleAuthService();
