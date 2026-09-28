import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuthenticationFailedError } from '../../core/errors.js';
import { config } from '../../core/config.js';

/**
 * Initializes or retrieves the Firebase Admin instance.
 * Supports standard service account credentials, emulator, or project configuration.
 */
function getFirebaseAdminAuth() {
  if (getApps().length > 0) {
    return getAuth(getApps()[0]);
  }

  const appOptions = {
    projectId: config.firebaseProjectId,
  };

  if (config.firebaseClientEmail && config.firebasePrivateKey) {
    try {
      appOptions.credential = cert({
        projectId: config.firebaseProjectId,
        clientEmail: config.firebaseClientEmail,
        privateKey: config.firebasePrivateKey.replace(/\\n/g, '\n'),
      });
    } catch {
      // Fall through to default credential or emulator
    }
  } else if (config.firebaseServiceAccountPath) {
    try {
      const resolvedPath = resolve(process.cwd(), config.firebaseServiceAccountPath);
      if (existsSync(resolvedPath)) {
        const fileContent = JSON.parse(readFileSync(resolvedPath, 'utf8'));
        appOptions.credential = cert(fileContent);
      }
    } catch {
      // Fall through to default credential or emulator
    }
  }

  const app = initializeApp(appOptions);
  return getAuth(app);
}

/**
 * Firebase Authentication & Identity Verification Service.
 * Conforms to:
 * - docs/6.SYSTEM-ARCHITECTURE.md Section 13, 14, 66
 * - docs/1.project.md Section 5, 6
 * - docs/2.requirements.md Requirement 22
 * - docs/phase-wise-plan.md Section 7
 *
 * STRICT BOUNDARY:
 * Answers exclusively: "Who is this user?"
 * Does NOT request, manage, or grant Google API scopes (Calendar, Tasks, Drive).
 */
export class FirebaseAuthService {
  constructor(options = {}) {
    this.projectId = options.projectId || config.firebaseProjectId || 'workaholic-dev';
    this.adminAuth = options.adminAuth || null;
    this.testVerifier = options.testVerifier || null;
    this.isTestEnv = (options.env || config.env) === 'test';
    this.isProdEnv = (options.env || config.env) === 'production';
  }

  /**
   * Lazily obtains the Firebase Admin Auth instance.
   */
  getAdminAuth() {
    if (!this.adminAuth) {
      this.adminAuth = getFirebaseAdminAuth();
    }
    return this.adminAuth;
  }

  /**
   * Safe base64url decoding helper
   */
  decodeBase64Url(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  /**
   * Verifies a Firebase ID token and extracts normalized identity claims.
   *
   * In production mode: Exclusively uses Firebase Admin SDK token verification.
   * In test mode: Permits test tokens via testVerifier or mock tokens for unit/offline testing.
   *
   * @param {string} idToken - Raw Firebase ID token (JWT)
   * @returns {Promise<{ provider: 'FIREBASE', subject: string, email: string|null, emailVerified: boolean, displayName: string, picture: string|null, signInProvider: string }>}
   */
  async verifyFirebaseIdToken(idToken) {
    if (!idToken || typeof idToken !== 'string') {
      throw new AuthenticationFailedError('Firebase ID token is required');
    }

    const trimmedToken = idToken.trim();
    if (trimmedToken.length < 10) {
      throw new AuthenticationFailedError('Malformed Firebase ID token');
    }

    // 1. If explicit test verifier is provided or test mode token is parsed
    if (this.testVerifier) {
      if (this.isProdEnv) {
        throw new Error(
          'FATAL SECURITY INVARIANT: Test verifier cannot execute in production mode',
        );
      }
      return this.testVerifier(trimmedToken);
    }

    // 2. Handle mock test tokens
    if (trimmedToken.endsWith('.mock_firebase_signature')) {
      if (this.isProdEnv) {
        throw new Error('FATAL SECURITY INVARIANT: Mock tokens are forbidden in production');
      }
      return this.verifyMockToken(trimmedToken);
    }

    // 3. Production & Standard Verification via Firebase Admin SDK
    try {
      const adminAuth = this.getAdminAuth();
      const decoded = await adminAuth.verifyIdToken(trimmedToken);

      const subject = decoded.uid || decoded.sub;
      if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
        throw new AuthenticationFailedError('Firebase token missing valid subject identifier');
      }

      const email = decoded.email ? String(decoded.email).trim().toLowerCase() : null;
      const emailVerified = Boolean(decoded.email_verified);
      const displayName = decoded.name || (email ? email.split('@')[0] : 'Workaholic User');
      const picture = decoded.picture || null;
      const signInProvider = decoded.firebase?.sign_in_provider || 'unknown';

      return {
        provider: 'FIREBASE',
        subject: String(subject).trim(),
        email,
        emailVerified,
        displayName,
        picture,
        signInProvider,
      };
    } catch (err) {
      if (err instanceof AuthenticationFailedError) {
        throw err;
      }
      // Sanitize Firebase Admin error messages
      const code = err.code || '';
      if (code === 'auth/id-token-expired') {
        throw new AuthenticationFailedError('Firebase ID token has expired');
      }
      if (code === 'auth/id-token-revoked') {
        throw new AuthenticationFailedError('Firebase ID token has been revoked');
      }
      if (code === 'auth/argument-error' || code === 'auth/invalid-id-token') {
        throw new AuthenticationFailedError('Invalid Firebase ID token');
      }
      throw new AuthenticationFailedError('Firebase token verification failed');
    }
  }

  /**
   * Internal test token verifier for deterministic offline unit testing.
   * Strictly prohibited in production environments.
   *
   * @param {string} token
   */
  verifyMockToken(token) {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthenticationFailedError('Malformed Firebase ID token');
    }

    let payload;
    try {
      const decodedPayload = this.decodeBase64Url(parts[1]);
      payload = JSON.parse(decodedPayload);
    } catch {
      throw new AuthenticationFailedError('Failed to parse Firebase ID token payload');
    }

    const expectedIssuer = `https://securetoken.google.com/${this.projectId}`;
    if (!payload.iss || payload.iss !== expectedIssuer) {
      throw new AuthenticationFailedError(`Invalid token issuer: ${payload.iss || 'missing'}`);
    }

    if (!payload.aud || payload.aud !== this.projectId) {
      throw new AuthenticationFailedError(
        `Token audience does not match configured Firebase Project ID: expected ${this.projectId}, got ${payload.aud}`,
      );
    }

    if (!payload.exp || typeof payload.exp !== 'number') {
      throw new AuthenticationFailedError('Token missing expiration claim');
    }

    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp < nowEpochSeconds - 60) {
      throw new AuthenticationFailedError('Firebase ID token has expired');
    }

    const subject = payload.uid || payload.sub;
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      throw new AuthenticationFailedError('Firebase token missing valid subject identifier');
    }

    const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
    const emailVerified = Boolean(payload.email_verified);
    const displayName = payload.name || (email ? email.split('@')[0] : 'Workaholic User');
    const picture = payload.picture || null;
    const signInProvider = payload.firebase?.sign_in_provider || 'google.com';

    return {
      provider: 'FIREBASE',
      subject: String(subject).trim(),
      email,
      emailVerified,
      displayName,
      picture,
      signInProvider,
    };
  }
}

/**
 * Creates a deterministic mock Firebase ID token for automated unit testing.
 * NEVER valid in production mode (signature ends with .mock_firebase_signature).
 */
export function createMockFirebaseIdToken(
  claims = {},
  projectId = config.firebaseProjectId || 'workaholic-dev',
) {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'mock-firebase-key-1' };
  const nowSec = Math.floor(Date.now() / 1000);

  const payload = {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    auth_time: nowSec - 60,
    user_id: claims.uid || claims.sub || 'firebase_uid_1234567890',
    sub: claims.uid || claims.sub || 'firebase_uid_1234567890',
    iat: claims.iat || nowSec - 60,
    exp: claims.exp || nowSec + 3600,
    email: claims.email !== undefined ? claims.email : 'alex@example.com',
    email_verified: claims.email_verified !== undefined ? claims.email_verified : true,
    firebase: {
      identities: {
        'google.com': [claims.googleSub || 'google_sub_12345'],
        email: claims.email ? [claims.email] : ['alex@example.com'],
      },
      sign_in_provider: claims.signInProvider || 'google.com',
    },
    name: claims.name || 'Alex Chen',
    picture: claims.picture || 'https://lh3.googleusercontent.com/a/mock-avatar',
    ...claims,
  };

  const toB64Url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${toB64Url(header)}.${toB64Url(payload)}.mock_firebase_signature`;
}

export const firebaseAuthService = new FirebaseAuthService();
