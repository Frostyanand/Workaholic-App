# Workaholic — Local Hackathon Demo & Operations Guide

> **Authoritative Operational Guide for Running Workaholic (Phases 0–21) Locally on Windows**  
> **Architecture Invariants:** Pure JavaScript/JSX ONLY (zero TypeScript) • Zero ORMs (pure `pg` client) • PostgreSQL 16 Authoritative

---

## 1. Prerequisites

Before starting the local demo, ensure your machine has:

| Component                | Minimum Version                | Verification Command                                                | Notes                                               |
| :----------------------- | :----------------------------- | :------------------------------------------------------------------ | :-------------------------------------------------- |
| **Node.js**              | `v18.18.0+` (v20+ recommended) | `node -v`                                                           | Required for native `fetch`, ES modules, and crypto |
| **npm**                  | `v10.0.0+`                     | `npm -v`                                                            | Supports npm workspaces                             |
| **PostgreSQL**           | `16` (or Docker Desktop)       | `docker --version` or `psql --version`                              | Authoritative system of record                      |
| **Google Cloud Project** | 1 Active Project               | [console.cloud.google.com](https://console.cloud.google.com/)       | For Calendar, Tasks, Drive OAuth                    |
| **Firebase Project**     | 1 Active Project               | [console.firebase.google.com](https://console.firebase.google.com/) | For Identity token verification & Google Sign-In    |

---

## 2. Fast Track: Quick Start (Under 2 Minutes)

If you already have Docker installed and want to experience Workaholic immediately with local demo credentials:

```powershell
# 1. Start PostgreSQL 16 container
docker compose up -d postgres

# 2. Run all database migrations
npm run migrate:up -w @workaholic/backend

# 3. Start the entire application (both API and Web UI)
npm run demo
# OR double-click: start-demo.bat
```

Once running:

- **Web Client UI:** [http://localhost:5173](http://localhost:5173)
- **Fastify REST API:** [http://localhost:3001](http://localhost:3001)
- **API Health Check:** [http://localhost:3001/api/v1/health](http://localhost:3001/api/v1/health)

Click **"Local Demo Login (Alex Chen)"** on the Sign-In page to immediately access the full productivity operating system.

---

## 3. Environment Configuration (`.env`)

Workaholic provides an authoritative environment template at the repository root: `.env.example`.

Create your local `.env` file at the repository root:

```powershell
cp .env.example .env
```

### Complete Environment Variable Reference

```env
# ==============================================================================
# 1. RUNTIME & SERVER
# ==============================================================================
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
CLIENT_URL=http://localhost:5173
LOG_LEVEL=info

# ==============================================================================
# 2. POSTGRESQL 16
# ==============================================================================
DATABASE_URL=postgresql://workaholic:workaholic_dev_secret@localhost:5432/workaholic_dev
DB_POOL_MAX=10
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=5000
DB_STATEMENT_TIMEOUT=30000

# ==============================================================================
# 3. SECURITY KEYS
# ==============================================================================
ENCRYPTION_KEY=workaholic_dev_32byte_secret_key_replace_in_production_12345
CRON_SECRET=dev_cron_secret_replace_in_production

# ==============================================================================
# 4. FIREBASE ADMIN (Backend)
# ==============================================================================
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL=YOUR_FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY="YOUR_FIREBASE_PRIVATE_KEY"
FIREBASE_AUTH_EMULATOR_HOST=

# ==============================================================================
# 5. GOOGLE OAUTH 2.0 (Backend)
# ==============================================================================
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:3001/api/v1/auth/google/callback

# ==============================================================================
# 6. FIREBASE WEB SDK (Frontend)
# ==============================================================================
VITE_API_URL=
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_PROJECT_ID.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_PROJECT_ID.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
```

---

## 4. Real Firebase Authentication Setup

To enable real Google Sign-In via Firebase Authentication:

### Step 4.1: Firebase Project & Google Sign-In Provider

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a project (e.g. `workaholic-demo`).
2. Navigate to **Build → Authentication → Get Started**.
3. Under **Sign-in method**, enable **Google**. Save the settings.

### Step 4.2: Register Web App (Frontend Credentials)

1. In Firebase Console, click the Settings Gear icon ⚙️ → **Project settings**.
2. Scroll down to **Your apps**, click the **Web icon (`</>`)**, and register `Workaholic Web`.
3. Copy the configuration fields into your `.env`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

### Step 4.3: Service Account (Backend Verification)

1. In Firebase Console, go to **Project settings → Service accounts**.
2. Click **Generate new private key** and download the JSON file.
3. Open the JSON file and map the fields into your `.env`:
   - `FIREBASE_PROJECT_ID` = `project_id`
   - `FIREBASE_CLIENT_EMAIL` = `client_email`
   - `FIREBASE_PRIVATE_KEY` = `private_key` (keep the `\n` characters escaped on a single line)

> [!IMPORTANT]
> Never place the downloaded service account JSON file into `apps/web` or commit it to git. Gitignore is pre-configured to ignore all `*serviceAccount*.json` files.

---

## 5. Google Cloud OAuth Setup (Calendar, Tasks, Drive)

Workaholic maintains a strict architectural boundary: **Firebase handles "Who is this user?"**, while **Google Cloud OAuth 2.0 handles external API permissions** for Calendar, Tasks, and Drive.

### Step 5.1: Enable Google APIs

In [Google Cloud Console](https://console.cloud.google.com/) for the same project:

1. Navigate to **APIs & Services → Library**.
2. Search and click **Enable** for:
   - **Google Calendar API**
   - **Google Tasks API**
   - **Google Drive API**

### Step 5.2: Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Select **External** (or Internal for Google Workspace).
3. App name: `Workaholic Local Demo`.
4. User support email: Select your email.
5. In **Scopes**, add:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/tasks`
   - `https://www.googleapis.com/auth/drive.file`
6. In **Test users**, add your own Google email address.

### Step 5.3: Create OAuth 2.0 Client ID

1. Navigate to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Name: `Workaholic Local Client`.
4. **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `http://localhost:3001`
5. **Authorized redirect URIs**:
   - `http://localhost:3001/api/v1/auth/google/callback`
6. Click **Create**, then copy the generated credentials into `.env`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=http://localhost:3001/api/v1/auth/google/callback`

---

## 6. End-to-End Integration Verification Flows

### Flow 1: Authentication & Workspace Bootstrap

1. Open [http://localhost:5173/login](http://localhost:5173/login).
2. Click **"Continue with Google"** (if Firebase credentials are configured) or **"Local Demo Login"**.
3. When using Google Sign-In:
   - Firebase popup opens → Sign in with your Google Account.
   - Browser receives Firebase ID token.
   - Browser calls `POST /api/v1/auth/session` with the ID token.
   - Backend `FirebaseAuthService` verifies token via Firebase Admin SDK.
   - Account bootstrap creates canonical User and Personal Workspace.
   - Session cookie (`workaholic_session`) is set.
   - Browser navigates to Today Cockpit (`/`).

### Flow 2: Google Calendar Two-Way Sync

1. Navigate to **Calendar** (`/calendar`).
2. Click **"Google Calendar Sync"** in the top action bar.
3. Click **"Connect Google Calendar"**.
4. The Google consent popup opens with Calendar scopes (`calendar.events`, `calendar.readonly`).
5. Grant consent → Google redirects to `http://localhost:3001/api/v1/auth/google/callback`.
6. Fastify exchanges the authorization code for long-lived AES-256-GCM encrypted tokens.
7. Return to the modal: Click **"Sync Now"**.
8. Verify events imported into Workaholic and export a new event to Google Calendar.
9. To disconnect: Click **"Disconnect"**. Native events are safely preserved.

### Flow 3: Google Tasks Synchronization

1. Navigate to **Tasks** (`/tasks`).
2. Click **"Google Tasks Sync"**.
3. Click **"Connect Google Tasks"** → complete Google authorization.
4. Discover mapped task lists (e.g. "My Tasks").
5. Click **"Sync Now"** → verify tasks synced with bidirectional mapping.
6. Verify disconnecting Google Tasks leaves native tasks completely intact.

### Flow 4: Google Drive Attachments

1. Navigate to **Tasks** (`/tasks`) and click any task to open the detail drawer.
2. In the **Attachments** section, click **"Attach from Google Drive"**.
3. Authorize Google Drive access (`drive.file` scope).
4. Select or attach a file.
5. Verify metadata and direct Google Drive web view URL.
6. Click **"Detach"** → Verify the confirmation modal explains that the file remains safely intact in your Google Drive.

---

## 7. Push Notifications & Local FCM Boundaries

| Scope                       | Implementation Status                                  | Local Developer Behavior                                                                  |
| :-------------------------- | :----------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| **In-App Notifications**    | **Full Implementation (Phase 11 & 14)**                | Active via in-process reminder dispatcher and REST API polling                            |
| **FCM Device Registration** | **Implemented (`POST /api/v1/devices/register-push`)** | Registers FCM token in PostgreSQL `user_devices` table                                    |
| **Push Dispatch Engine**    | **Implemented (`reminder-dispatcher.js`)**             | Selects pending reminders and queues notification records                                 |
| **Browser Push Delivery**   | **Cloud Dependent**                                    | Local browser Web Push requires valid HTTPS origin and active Service Worker registration |

---

## 8. Troubleshooting Common Issues

### Issue 1: Database connection refused on port 5432

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:** Run `docker compose up -d postgres` to start the PostgreSQL 16 container, or verify your local PostgreSQL service is running on port 5432.

### Issue 2: `OAuth state mismatch` or `Invalid OAuth state`

**Cause:** The session or state expired (10-minute window) or was generated from a different user session.  
**Fix:** Close the popup, ensure you are logged into Workaholic, and click "Connect" again.

### Issue 3: Firebase `auth/unauthorized-domain`

**Cause:** `localhost` is not in the list of authorized domains in Firebase Console.  
**Fix:** In Firebase Console → **Authentication → Settings → Authorized domains**, ensure `localhost` is listed.

### Issue 4: Missing Google OAuth callback redirect

**Cause:** The redirect URI in Google Cloud Console does not match `GOOGLE_REDIRECT_URI`.  
**Fix:** Ensure `http://localhost:3001/api/v1/auth/google/callback` is added to **Authorized redirect URIs** in Google Cloud Console.
