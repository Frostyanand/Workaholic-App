import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  connectAuthEmulator,
} from 'firebase/auth';

/**
 * Firebase Web SDK Configuration & Client Provider.
 * Reads environment variables from Vite (import.meta.env).
 * Conforms to docs/6.SYSTEM-ARCHITECTURE.md Section 13, 14.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'workaholic-dev',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let authInstance = null;
let providerInstance = null;

/**
 * Returns true if Firebase Web SDK is configured with an API key and project ID.
 */
export function isFirebaseConfigured() {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_API_KEY !== 'YOUR_FIREBASE_API_KEY',
  );
}

/**
 * Lazily initializes and returns Firebase Auth instance.
 */
export function getFirebaseAuth() {
  if (authInstance) return authInstance;

  if (!isFirebaseConfigured()) {
    return null;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  authInstance = getAuth(app);

  const emulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulatorHost) {
    try {
      connectAuthEmulator(authInstance, `http://${emulatorHost}`, { disableWarnings: true });
    } catch {
      // Already connected or not supported
    }
  }

  return authInstance;
}

/**
 * Signs in with Google using Firebase popup flow and returns raw ID token.
 * @returns {Promise<{ idToken: string, user: Object }>}
 */
export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error(
      'Firebase is not configured. Please supply VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID in .env.',
    );
  }

  if (!providerInstance) {
    providerInstance = new GoogleAuthProvider();
    providerInstance.setCustomParameters({
      prompt: 'select_account',
    });
  }

  const userCredential = await signInWithPopup(auth, providerInstance);
  const idToken = await userCredential.user.getIdToken();

  return {
    idToken,
    user: userCredential.user,
  };
}

/**
 * Helper to encode string to base64url for browser
 */
function toBase64Url(obj) {
  const json = JSON.stringify(obj);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generates a valid mock Firebase ID token for local development & hackathon demo
 * when real Firebase cloud credentials have not yet been configured in .env.
 * Verified by backend's FirebaseAuthService in non-production environments.
 */
export function createDemoIdToken(email = 'alex@example.com', name = 'Alex Chen') {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'workaholic-dev';
  const header = { alg: 'RS256', typ: 'JWT', kid: 'mock-firebase-key-1' };
  const nowSec = Math.floor(Date.now() / 1000);
  const uid = 'demo_user_' + email.split('@')[0];

  const payload = {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    auth_time: nowSec - 60,
    user_id: uid,
    sub: uid,
    iat: nowSec - 60,
    exp: nowSec + 7200,
    email,
    email_verified: true,
    firebase: {
      identities: {
        'google.com': ['google_sub_' + uid],
        email: [email],
      },
      sign_in_provider: 'google.com',
    },
    name,
    picture: 'https://lh3.googleusercontent.com/a/mock-avatar',
  };

  return `${toBase64Url(header)}.${toBase64Url(payload)}.mock_firebase_signature`;
}

/**
 * Signs out from Firebase Auth.
 */
export async function signOutFromFirebase() {
  const auth = getFirebaseAuth();
  if (auth) {
    await signOut(auth);
  }
}
