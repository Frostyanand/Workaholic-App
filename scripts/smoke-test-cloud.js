#!/usr/bin/env node
import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Load .env
dotenv.config({ path: resolve(process.cwd(), '.env') });

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

async function main() {
  console.log(`
${COLORS.bold}${COLORS.cyan}========================================================================${COLORS.reset}
${COLORS.bold}${COLORS.cyan}      WORKAHOLIC — CLOUD PROVIDER INTEGRATION SMOKE TEST               ${COLORS.reset}
${COLORS.bold}${COLORS.cyan}========================================================================${COLORS.reset}
`);

  // 1. Audit Firebase Admin Credentials
  console.log(`${COLORS.bold}1. Firebase Admin Configuration Status:${COLORS.reset}`);
  const fbProject = process.env.FIREBASE_PROJECT_ID;
  const fbEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const fbKey = process.env.FIREBASE_PRIVATE_KEY;
  const fbPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  let serviceAccountCredentials = null;

  if (fbPath) {
    const { existsSync, readFileSync } = await import('node:fs');
    const resolved = resolve(process.cwd(), fbPath);
    if (existsSync(resolved)) {
      try {
        serviceAccountCredentials = JSON.parse(readFileSync(resolved, 'utf8'));
        console.log(
          `  ${COLORS.green}✅ Service Account JSON file detected at: ${fbPath}${COLORS.reset}`,
        );
      } catch (err) {
        console.log(
          `  ${COLORS.red}❌ Failed to parse Service Account JSON at ${fbPath}: ${err.message}${COLORS.reset}`,
        );
      }
    } else {
      console.log(
        `  ${COLORS.red}❌ Service Account JSON file NOT found at: ${resolved}${COLORS.reset}`,
      );
    }
  } else if (
    fbProject &&
    fbProject !== 'YOUR_FIREBASE_PROJECT_ID' &&
    fbEmail &&
    fbEmail !== 'YOUR_FIREBASE_CLIENT_EMAIL' &&
    fbKey &&
    fbKey !== 'YOUR_FIREBASE_PRIVATE_KEY'
  ) {
    serviceAccountCredentials = {
      projectId: fbProject,
      clientEmail: fbEmail,
      privateKey: fbKey.replace(/\\n/g, '\n'),
    };
    console.log(
      `  ${COLORS.green}✅ Firebase Admin credentials detected for project: ${fbProject}${COLORS.reset}`,
    );
  }

  if (serviceAccountCredentials) {
    try {
      const { initializeApp, cert, getApps } = await import('firebase-admin/app');
      const { getAuth } = await import('firebase-admin/auth');

      const app =
        getApps().length > 0
          ? getApps()[0]
          : initializeApp({
              credential: cert(serviceAccountCredentials),
            });
      const _auth = getAuth(app);
      console.log(
        `  ${COLORS.green}✅ Firebase Admin SDK initialized successfully.${COLORS.reset}`,
      );
    } catch (err) {
      console.log(
        `  ${COLORS.red}❌ Firebase Admin initialization failed: ${err.message}${COLORS.reset}`,
      );
    }
  } else {
    console.log(
      `  ${COLORS.yellow}⚠️  Firebase Admin credentials not set (placeholder detected).${COLORS.reset}`,
    );
    console.log(
      `  ℹ️  Local mode active: backend permits mock tokens ending in .mock_firebase_signature.`,
    );
  }

  // 2. Audit Google Cloud OAuth Credentials
  console.log(`\n${COLORS.bold}2. Google Cloud OAuth Configuration Status:${COLORS.reset}`);
  const gClientId = process.env.GOOGLE_CLIENT_ID;
  const gClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const gRedirect =
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/v1/auth/google/callback';

  if (gClientId && gClientId !== 'YOUR_GOOGLE_CLIENT_ID' && gClientSecret) {
    console.log(
      `  ${COLORS.green}✅ Google OAuth Client ID detected: ${gClientId.substring(0, 16)}...${COLORS.reset}`,
    );
    console.log(`  ${COLORS.green}✅ Redirect URI: ${gRedirect}${COLORS.reset}`);
    console.log(
      `  ${COLORS.green}✅ Real OAuth exchange enabled in oauth-boundary.service.js.${COLORS.reset}`,
    );
  } else {
    console.log(
      `  ${COLORS.yellow}⚠️  Google OAuth credentials not configured (placeholders detected).${COLORS.reset}`,
    );
    console.log(`  ℹ️  Local mock adapter active: simulation tokens used for testing.`);
  }

  // 3. Audit Web Client Firebase SDK
  console.log(`\n${COLORS.bold}3. Frontend Firebase Web SDK Status:${COLORS.reset}`);
  const webApiKey = process.env.VITE_FIREBASE_API_KEY;
  if (webApiKey && webApiKey !== 'YOUR_FIREBASE_API_KEY') {
    console.log(
      `  ${COLORS.green}✅ VITE_FIREBASE_API_KEY detected. Google Sign-In button enabled in UI.${COLORS.reset}`,
    );
  } else {
    console.log(`  ${COLORS.yellow}⚠️  VITE_FIREBASE_API_KEY not configured.${COLORS.reset}`);
    console.log(
      `  ℹ️  "Local Demo Login" active in LoginPage for instantaneous developer onboarding.`,
    );
  }

  console.log(`
${COLORS.bold}${COLORS.cyan}========================================================================${COLORS.reset}
${COLORS.bold}Smoke audit complete.${COLORS.reset}
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
