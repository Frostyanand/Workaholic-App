# Workaholic Implementation Progress

## Status Overview

- **Current Phase**: Phase 3 — Backend Foundation (COMPLETED & VERIFIED)
- **Current Task**: Phase 3 Complete — Ready for Final Phase 3 Audit
- **Overall Project Status**: Phase 0, Phase 1, Phase 2 & Phase 3 Complete
- **Last Updated**: 2026-09-06
- **Architecture Invariant**: JavaScript/JSX ONLY (zero TypeScript, zero ORMs, PostgreSQL authoritative, React 18.2.0 baseline)

---

## Phase 0: Repository & Tooling Foundation

### Completed Tasks

1. **Repository Setup & Structure**:
   - Monorepo configured via standard `npm workspaces` (`apps/*`, `packages/*`).
   - Workspaces established:
     - `packages/shared`: Shared domain constants, enums, and Zod validation schemas.
     - `apps/backend`: Node.js Fastify REST API service with native `fastify.inject()`.
     - `apps/web`: React + Vite client shell adhering to Design System specifications.
     - `apps/desktop`: Electron application shell (pure JavaScript, contextIsolation enabled).
     - `apps/mobile`: Expo / React Native application scaffold (pure JavaScript).
   - `.gitignore`, `.prettierrc.json`, `.prettierignore`, `.env.example`, and `docker-compose.yml` created.

2. **JavaScript-Only Enforcement**:
   - Automated guard script created at `scripts/check-js-only.js`.
   - Script verifies that zero `.ts` or `.tsx` source files and zero `tsconfig*.json` files exist.
   - Guard integrated into repository verification workflow (`npm run check:js-only`).

3. **Code Quality & Formatting Tooling**:
   - ESLint 9 Flat Config (`eslint.config.js`) configured for pure JavaScript/JSX with React and Hooks plugins.
   - Prettier configured with strict 2-space indentation, single quotes, and trailing commas.
   - `docs/` folder protected from automated code reformatting via `.prettierignore`.

4. **Shared Package Foundation (`@workaholic/shared`)**:
   - Standard domain constants exported (`TASK_STATUS`, `TASK_PRIORITY`, `DAY_ORDER`, `CALENDAR_SOURCE`, `WORKSPACE_ROLE`, `ERROR_CODE`).
   - Standard Zod schemas exported (`idSchema`, `idempotencyKeySchema`, `paginationQuerySchema`, `createTaskSchema`, `apiErrorResponseSchema`).
   - Comprehensive unit test suite implemented at `packages/shared/tests/schemas.test.js`.

5. **Backend Service Foundation (`@workaholic/backend`)**:
   - Fastify app factory (`src/app.js`) with `@fastify/cors` and `@fastify/helmet`.
   - Global error handler and 404 handler strictly adhering to `API-SPECIFICATION.md` JSON envelope:
     ```json
     {
       "error": {
         "code": "NOT_FOUND",
         "message": "...",
         "requestId": "..."
       }
     }
     ```
   - Standardized `x-request-id` propagation across all requests and error envelopes.
   - Centralized PostgreSQL connection pool (`src/core/db.js`) supporting direct queries, transaction boundaries (`withTransaction`), and connection health checks.
   - Database migration foundation configured using `node-pg-migrate` (`migrations/1725628800000_initial_extensions.sql`).
   - Health endpoints implemented at `/api/v1/health` and `/api/v1/health/db`.
   - Fastify `inject()` test suite implemented at `apps/backend/tests/health.test.js`.

6. **Web Client Foundation (`@workaholic/web`)**:
   - React 18 + Vite configuration (`vite.config.js`) with dev server proxy to backend (`/api` -> `localhost:3001`).
   - Pure CSS design tokens implemented in `src/index.css` matching `14.DESIGN-SYSTEM.md` (dark theme, glassmorphism, semantic colors).
   - App shell (`src/App.jsx`) with responsive navigation and default Today cockpit view.
   - JSDOM test suite implemented at `apps/web/tests/app.test.jsx`.
   - Production bundle build verified (`npm run build --workspace=@workaholic/web`).

7. **Database & Infrastructure Scaffold**:
   - `docker-compose.yml` specifying PostgreSQL 16 Alpine with persistent volume.
   - `docker/init-db.sql` provisioning mandatory extensions (`uuid-ossp`, `btree_gist`).

---

## Verification Results

All required verification checks have passed successfully:

| Verification Step        | Command                                | Result     | Notes                                       |
| ------------------------ | -------------------------------------- | ---------- | ------------------------------------------- |
| Dependency Resolution    | `npm install`                          | **PASSED** | 1410 packages resolved, zero peer conflicts |
| JavaScript-Only Guard    | `npm run check:js-only`                | **PASSED** | 0 TypeScript files found across repository  |
| Linter Verification      | `npm run lint`                         | **PASSED** | 0 errors, 0 warnings across all files       |
| Code Formatting Check    | `npm run format:check`                 | **PASSED** | All matched files use Prettier style        |
| Test Suite (Shared)      | `npx vitest run packages/shared`       | **PASSED** | 6/6 tests passed                            |
| Test Suite (Backend)     | `npx vitest run apps/backend`          | **PASSED** | 3/3 tests passed (`app.inject()`)           |
| Test Suite (Web)         | `npx vitest run apps/web`              | **PASSED** | 2/2 tests passed (jsdom)                    |
| Combined Test Suite      | `npm test`                             | **PASSED** | 11/11 tests passed across all workspaces    |
| Web Production Build     | `npm run build -w @workaholic/web`     | **PASSED** | Production bundle generated in 2.3s         |
| Backend Live HTTP Test   | Direct Node `app.listen()`             | **PASSED** | Live port binding and HTTP 200 response     |
| Desktop Package Scaffold | `npm run check -w @workaholic/desktop` | **PASSED** | Electron scaffold verified                  |
| Mobile Package Scaffold  | `npm run check -w @workaholic/mobile`  | **PASSED** | React Native / Expo scaffold verified       |

---

## Important Implementation Decisions

1. **React Version Unification**:
   - React was pinned to `18.2.0` across the monorepo. React Native 0.74.5 strictly requires `react@18.2.0`, while React 18.2.0 is fully compatible with Vite, React DOM, Lucide, and React Router 6. Unifying React at `18.2.0` prevents multiple duplicate copies of React in the monorepo and eliminates hook mismatch errors.
2. **Native Fastify Testing**:
   - In accordance with the compatibility report and architectural decisions, `supertest` was omitted in favor of Fastify's native `fastify.inject()`, which executes faster and requires no external network ports during automated testing.
3. **Prettier Isolation for Documentation**:
   - Added `.prettierignore` to protect all preexisting markdown specifications in `docs/` from unintentional reformatting while ensuring consistent styling across all source files.
4. **No Forbidden Dependencies**:
   - Confirmed zero occurrences of TypeScript, Prisma, Drizzle, TypeORM, Redis, Kafka, RabbitMQ, Kubernetes, microservices, Elasticsearch, Turborepo, or Nx.

---

## Deviations from the Plan

- None. All deliverables and boundaries of Phase 0 were executed strictly as planned.

---

## Unresolved Issues / Host Environment Notes

- **Docker Engine Daemon**: Docker Desktop CLI is installed (`v29.1.3`, Compose `v2.40.3`), but the Docker Desktop Linux engine service was not actively running in the host background during this run. The `docker-compose.yml` and `docker/init-db.sql` files are ready to spin up PostgreSQL 16 as soon as Docker Desktop is started.

---

## Phase 1: Application Skeleton (In Progress)

### Completed Tasks

1. **Task 1.1 — Web Application Shell**:
   - React application shell (`apps/web/src/App.jsx`) with routing foundation, error boundary, loading states, and accessibility.
   - Distinct layout shells:
     - `AuthLayout`: Unauthenticated shell with centered branding and container for login/public pages (`/login`).
     - `AppLayout`: Authenticated shell with responsive navigation sidebar, skip link (`#main-content`), active route indicators, session footer, and view-level Error Boundary.
   - Core page components:
     - `TodayPage`: Daily cockpit view with focus task and schedule cards.
     - `LoginPage`: Unauthenticated sign-in shell (stubbed for Phase 3).
     - `NotFoundPage`: Accessible 404 fallback page with return to Today.
     - `PlaceholderPage`: Shell placeholder for `/tasks`, `/boards`, `/calendar`, `/academic`, `/notes`, `/settings`.
   - Common components:
     - `ErrorBoundary`: Class component with fallback UI and reset recovery action.
     - `LoadingSpinner`: Accessible spinner with `role="status"` and visually hidden text.
   - Comprehensive Vitest test suite (`apps/web/tests/app.test.jsx`):
     - Verified root render, placeholder routing, unauthenticated login route, 404 fallback, ErrorBoundary recovery, and LoadingSpinner status.
   - Verified with: `npm test` (15/15 tests passing across all packages), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed), `npm run build -w @workaholic/web` (Vite production bundle built cleanly).

2. **Task 1.2 — Backend Application Structure**:
   - Modular backend structure in `apps/backend/src/modules/` covering core domains:
     - `auth`: Route plugin with session status endpoint (`/api/v1/auth/session`) and `requireAuth` preHandler hook.
     - `users`: Route plugin with `/api/v1/users/me` endpoint enforcing user context.
     - `workspaces`: Route plugin with `/api/v1/workspaces` collection endpoint.
     - `tasks`: Route plugin with `/api/v1/tasks` collection endpoint and standard pagination envelope.
     - `calendar`: Route plugin with `/api/v1/calendar/events` endpoint.
     - `notes`: Route plugin with `/api/v1/notes` collection endpoint and standard pagination envelope.
     - `health`: Route plugin with liveness (`/api/v1/health`) and readiness (`/api/v1/health/db`) endpoints.
   - Request lifecycle & decorators:
     - `setupRequestContext` (`apps/backend/src/core/request-context.js`) decorating Fastify requests with `user`, `workspace`, and `session` fields conforming to `API-SPECIFICATION.md` Section 6.
     - Standard response helper `sendSuccess` (`apps/backend/src/core/response.js`) guaranteeing `{ data: ... }` / `{ data: ..., pagination: ... }` JSON envelopes.
     - Global `x-request-id` header generation and propagation across success and error responses.
   - Comprehensive Fastify `app.inject()` test suite (`apps/backend/tests/modules.test.js`):
     - Verified session checking, unauthenticated rejection (401) across all protected domain modules, request ID propagation, and authenticated context responses.
   - Verified with: `npm test` (19/19 tests passing across all packages), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

3. **Task 1.3 — Windows Desktop Foundation**:
   - Real Electron desktop foundation in `apps/desktop/`:
     - `src/main.js`: Main process lifecycle, single-instance lock (`app.requestSingleInstanceLock`), graceful window-all-closed termination, and secure window options.
     - Strict security invariants enforced: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
     - `src/preload.js`: Secure context bridge exposing `window.workaholicDesktop` with whitelisted IPC channels (`desktop:ping`, `desktop:get-system-info`, `desktop:window-minimize`, `desktop:window-maximize`, `desktop:window-close`).
     - Rejection of unauthorized IPC channels with explicit errors.
   - Dedicated Vitest test suite (`apps/desktop/tests/desktop.test.js`):
     - Verified window security options, IPC channel whitelisting, and preload context bridge exposure/rejections.
   - Verified with: `npm test` (22/22 tests passing across all packages), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

---

## Active Task: Task 1.4 — Android Foundation

4. **Task 1.4 — Android Foundation**:
   - React Native / Expo foundation in `apps/mobile/`:
     - `App.jsx` & `index.js`: Modern entry point rendering mobile application shell.
     - `src/navigation/TabNavigator.jsx` & `src/navigation/tabs.js`: Tab-based navigation skeleton providing direct access to Today, Tasks, Calendar, Notes, and Settings.
     - `src/screens/TodayScreen.jsx`: Daily cockpit screen with active focus task and daily schedule cards.
     - `src/screens/PlaceholderScreen.jsx`: Generic accessible placeholder for unpopulated routes in Phase 1.
     - `src/config/env.js`: Environment configuration foundation resolving platform-specific API endpoints (`10.0.2.2:3001` for Android emulator, `localhost:3001` for iOS/web).
     - `src/services/api.js`: Standardized API client wrapping fetch, adding JSON headers, and returning structured `{ data }` / `{ error }` response envelopes.
     - `app.json`: Updated with application scheme `workaholic`, dark theme background (`#0a0d14`), and portrait orientation.
   - Dedicated Vitest test suite (`apps/mobile/tests/mobile.test.js`):
     - Verified tab navigation definitions, environment config, API client request formatting, standard response envelopes, HTTP error envelopes, and network exception handling.
   - Verified with: `npm test` (28/28 tests passing across all packages), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

5. **Task 1.5 — Shared Code Foundation**:
   - Platform-safe date/time utilities (`packages/shared/src/utils/datetime.js`):
     - Pure JavaScript implementation ensuring identical behavior on Node.js, Web, Electron, and React Native.
     - `isValidISODateString`, `parseISODate`, `formatISODate` (`YYYY-MM-DD`), `formatISODateTime` (ISO 8601 UTC), `getStartOfDay` (UTC 00:00:00.000), `getEndOfDay` (UTC 23:59:59.999), `isSameDay`, `addDays`.
   - Domain constants expansion (`packages/shared/src/constants/index.js`):
     - `RECURRENCE_FREQUENCY` (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`) conforming to `DOMAIN-MODEL.md`.
     - `PLATFORM` (`WEB`, `WINDOWS`, `ANDROID`) conforming to system specifications.
   - API response envelope schemas (`packages/shared/src/schemas/index.js`):
     - `apiSuccessSingleSchema` (`{ data: ... }`).
     - `apiSuccessCollectionSchema` (`{ data: [...], pagination: { ... } }`).
   - Unit tests:
     - `packages/shared/tests/datetime.test.js`: 7 tests verifying date math, ISO formatting, boundaries, and validation.
     - `packages/shared/tests/schemas.test.js`: Expanded to 9 tests covering new enums and success envelopes.
   - Verified with: `npm test` (38/38 tests passing across all packages), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

6. **Task 1.6 — Phase 1 Comprehensive Verification**:
   - Full automated test suite verification: 38/38 tests passing across shared, backend, desktop, mobile, and web.
   - Strict JavaScript-only guard verification: zero TypeScript files in repository.
   - Code formatting verification: 100% Prettier compliant.
   - Linter verification: ESLint 9 Flat Config passing with 0 errors and 0 warnings.
   - Web application bundle build: Vite production build succeeded in 1.62s (`dist/index.html`, `dist/assets/*`).
   - Desktop application check: Electron scaffold verified.
   - Mobile application check: React Native / Expo scaffold verified.

---

## Comprehensive Verification Results (Phase 1 Final)

| Verification Check        | Scope / Command                        | Result     | Metrics / Details                                   |
| ------------------------- | -------------------------------------- | ---------- | --------------------------------------------------- |
| **JavaScript-Only Guard** | `npm run check:js-only`                | **PASSED** | 0 TypeScript files across whole repository          |
| **Linter Verification**   | `npm run lint`                         | **PASSED** | 0 errors, 0 warnings across all files               |
| **Formatting Check**      | `npm run format:check`                 | **PASSED** | All matched files use Prettier style                |
| **Shared Unit Tests**     | `packages/shared/tests/*.test.js`      | **PASSED** | 16/16 tests passed (schemas + datetime)             |
| **Backend API Tests**     | `apps/backend/tests/*.test.js`         | **PASSED** | 7/7 tests passed (health + domain modules)          |
| **Desktop Tests**         | `apps/desktop/tests/*.test.js`         | **PASSED** | 3/3 tests passed (security + IPC whitelist)         |
| **Mobile Tests**          | `apps/mobile/tests/*.test.js`          | **PASSED** | 6/6 tests passed (tabs + env + API client)          |
| **Web Shell Tests**       | `apps/web/tests/*.test.jsx`            | **PASSED** | 6/6 tests passed (routes + layout + error boundary) |
| **Monorepo Test Suite**   | `npm test`                             | **PASSED** | **38/38 tests passed** across 7 test files          |
| **Web Production Build**  | `npm run build -w @workaholic/web`     | **PASSED** | Production bundle generated in 1.62s                |
| **Desktop Shell Check**   | `npm run check -w @workaholic/desktop` | **PASSED** | Scaffold verified                                   |
| **Mobile Shell Check**    | `npm run check -w @workaholic/mobile`  | **PASSED** | Scaffold verified                                   |

---

## Architectural Decisions & Standards Established in Phase 1

1. **React Version Baseline (18.2.0)**:
   - Formally accepted React 18.2.0 and React DOM 18.2.0 as monorepo baseline to align with Expo SDK 51 and React Native 0.74.5 peer dependency constraints without npm overrides.
2. **Database Boundary Discipline**:
   - Zero database repositories or speculative CRUD endpoints were created during Phase 1. Database models, migrations, and PostgreSQL access patterns properly belong to Phase 2.
3. **Electron Security Invariants**:
   - Windows desktop main process enforces `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and single-instance locks with explicit channel whitelisting in `preload.js`.
4. **Fastify Modular Monolith Architecture**:
   - Established domain module folders (`auth`, `users`, `workspaces`, `tasks`, `calendar`, `notes`, `health`) under `apps/backend/src/modules/` with request context decoration (`request.user`, `request.workspace`, `request.session`, `request.id`) and standard JSON response envelopes (`{ data: ... }` / `{ error: ... }`).

---

## Phase 2: Database Foundation (In Progress)

### Completed Tasks

1. **Task 2.1 — Database Connection**:
   - Production-grade PostgreSQL connection layer implemented in `apps/backend/src/core/db.js` using pure `pg`:
     - `createPool`: Factory function supporting custom options and configurable defaults (`dbPoolMax: 10`, `dbIdleTimeout: 30000ms`, `dbConnectionTimeout: 5000ms`, `dbStatementTimeout: 30000ms`, `application_name: 'workaholic-backend'`).
     - Error handling on idle pool clients: Dedicated `pool.on('error', ...)` listener preventing unhandled process crashes from unexpected socket termination.
     - Credential sanitization: Helper `sanitizeDatabaseUrl` in `apps/backend/src/core/config.js` redacting database passwords (`postgresql://user:****@host:port/db`) and `sanitizeError` stripping credentials from query error messages.
     - Parameterized query enforcement: `query(text, params, client)` enforcing string SQL and array params to prevent string interpolation.
     - ACID transaction boundary: `withTransaction(workFn, poolOrClient)` managing client checkout, `BEGIN`, `COMMIT`, `ROLLBACK` on error, guaranteed client release in `finally`, and re-entrant client participation.
     - Observability & Metrics: `getPoolMetrics(pool)` exposing `totalCount`, `idleCount`, and `waitingCount`.
     - Fastify health check integration: `/api/v1/health/db` updated to include safe pool metrics alongside connection status.
     - Graceful shutdown: `closePool(pool)` safely ending active connections.
   - Comprehensive test suite (`apps/backend/tests/database.test.js`):
     - 13 tests covering configuration parameters, credential sanitization, pool factory options, idle client error handlers, parameterized query validation, error sanitization, transaction commit/rollback/release, nested client participation, pool metrics, and live connection status probing.
   - Live Database Connectivity Status:
     - Verified that Docker Desktop / PostgreSQL container is currently offline on host (`connection refused`).
     - Unit tests execute with 100% mocked isolation and pass without requiring external live database.
     - Live connectivity test transparently reports the offline state without faking.
     - Command to launch local database when Docker is started: `docker compose up -d postgres`.
   - Verified with: `npm test` (51/51 tests passing across 8 test files), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

---

2. **Task 2.2 — Migration System**:
   - Programmatic and CLI migration runner established using `node-pg-migrate`:
     - `apps/backend/src/core/migrator.js`: Programmatic migration runner supporting `up`, `down`, and `status` directions, single-transaction atomic execution (`singleTransaction: true`), explicit migration tracking table (`pgmigrations`), migration directory resolution (`apps/backend/migrations`), and credential-safe logging (passwords redacted).
     - `apps/backend/scripts/migrate.js`: CLI runner handling command arguments (`up`, `down`, `status`, count) with error handling, connection termination, and process exit codes.
     - `apps/backend/package.json`: NPM migration scripts (`migrate:up`, `migrate:down`, `migrate:status`).
     - Initial migration `1725628800000_init_extensions.sql` written with strict reversible `-- Up Migration` and `-- Down Migration` sections enabling `uuid-ossp` and `pgcrypto`.
   - Comprehensive test suite (`apps/backend/tests/migrator.test.js`):
     - 6 unit tests verifying migration directory existence, valid reversible SQL format, programmatic runner configuration options, rollback execution parameters, CLI runner error handling, and credential redaction during migration logging.
   - Verified with: `npm test` (57/57 tests passing across 9 test files), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

---

3. **Task 2.3 & 2.4 — Core Relational Tables & Schema Invariants**:
   - Implemented authoritative core schema migration `apps/backend/migrations/1725628801000_create_core_tables.sql`:
     - Foundational tables matching `docs/7.DATABASE-DESIGN.md`:
       - `users`: UUID PK (`uuid_generate_v4()`), `display_name`, `email`, `profile_image_reference`, `timezone` (default 'UTC'), `locale` (default 'en'), `preferences` (JSONB default '{}'), timestamps (`created_at`, `updated_at`), and soft-delete (`deleted_at`).
       - `workspaces`: UUID PK, `name`, `workspace_type` ('PERSONAL', 'TEAM'), `owner_user_id` FK -> `users(id)` with `ON DELETE RESTRICT`, timestamps, and soft-delete.
       - `workspace_memberships`: UUID PK, `workspace_id` FK -> `workspaces(id)` with `ON DELETE CASCADE`, `user_id` FK -> `users(id)` with `ON DELETE CASCADE`, `role` ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER'), `status` ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'), `joined_at`, timestamps, and unique composite constraint `uq_workspace_memberships_workspace_user (workspace_id, user_id)`.
       - `devices`: UUID PK, `user_id` FK -> `users(id)` with `ON DELETE CASCADE`, `platform` ('WEB', 'WINDOWS', 'ANDROID'), `device_name`, `application_version`, `push_token_reference`, `trust_state` ('TRUSTED', 'UNTRUSTED', 'REVOKED'), `last_seen_at`, and timestamps.
       - `sessions`: UUID PK, `user_id` FK -> `users(id)` with `ON DELETE CASCADE`, `device_id` FK -> `devices(id)` with `ON DELETE SET NULL`, `session_token_hash` UNIQUE, `session_type` ('WEB', 'DESKTOP', 'MOBILE', 'API'), `expires_at`, `revoked_at`, `last_seen_at`, and `created_at`.
     - Schema invariants, indexes, and constraints:
       - Unique case-insensitive partial index on active user emails: `idx_users_email_active ON users (LOWER(email)) WHERE deleted_at IS NULL`.
       - Soft-delete indexes for fast tenant filtering.
       - Performance indexes on foreign keys and active session lookups.
       - Deterministic and reversible down migration with dependency-ordered cascading drops.
   - Synchronized shared package contracts:
     - `packages/shared/src/constants/index.js`: Added frozen enums `WORKSPACE_TYPE`, `MEMBERSHIP_STATUS`, `DEVICE_TRUST_STATE`, `SESSION_TYPE`.
     - `packages/shared/src/schemas/index.js`: Added Zod validation schemas `createUserSchema`, `updateUserSchema`, `createWorkspaceSchema`, `updateWorkspaceSchema`, `createMembershipSchema`, `createDeviceSchema`, and `createSessionSchema`.
   - Comprehensive test suites:
     - `apps/backend/tests/schema.test.js`: 18 tests verifying table definitions, UUID PKs, timestamps, soft-delete columns, referential actions, unique constraints, check constraints, and down-migration reverse drop ordering.
     - `packages/shared/tests/schemas.test.js`: Expanded to 13 tests covering new enums and validation schemas.
   - Verified with: `npm test` (79/79 tests passing across 10 test files), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

---

4. **Task 2.5 — Data Access Layer / Repositories**:
   - Pure `pg` parameterized data access layer established for core Phase 2 entities with zero ORMs:
     - `apps/backend/src/modules/users/users.repository.js`:
       - `createUser`: Parameterized INSERT returning clean camelCase domain model (`id`, `displayName`, `email`, `profileImageReference`, `timezone`, `locale`, `preferences`, `createdAt`, `updatedAt`, `deletedAt`).
       - `findUserById`: Parameterized SELECT enforcing soft-delete filter (`deleted_at IS NULL`).
       - `findUserByEmail`: Parameterized case-insensitive SELECT (`LOWER(email) = LOWER($1)`).
       - `updateUser`: Dynamic parameterized field updates with `updated_at = CURRENT_TIMESTAMP`.
       - `softDeleteUser`: Sets `deleted_at = CURRENT_TIMESTAMP`.
     - `apps/backend/src/modules/workspaces/workspaces.repository.js`:
       - `findWorkspaceById`: Parameterized SELECT enforcing soft-delete filter (`deleted_at IS NULL`).
       - `findWorkspacesForUser`: Enforces tenant isolation by joining active memberships (`wm.user_id = $1 AND wm.status = 'ACTIVE' AND w.deleted_at IS NULL`).
       - `createWorkspaceWithMembership`: Multi-step atomic ACID transaction using `withTransaction` ensuring workspace creation and owner membership creation succeed together or rollback on any failure.
       - `findWorkspaceMemberships`: Lists active members with user profiles.
       - `addWorkspaceMembership`: Inserts membership with configurable role and status.
       - `updateMembershipRole`: Updates membership role with audit timestamp.
       - `softDeleteWorkspace`: Sets `deleted_at = CURRENT_TIMESTAMP`.
     - `apps/backend/src/modules/auth/sessions.repository.js`:
       - `createSession`: Parameterized INSERT for active sessions.
       - `findActiveSessionByTokenHash`: Looks up session ensuring `revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP AND u.deleted_at IS NULL`.
       - `touchSession`: Updates `last_seen_at`.
       - `revokeSession`: Sets `revoked_at = CURRENT_TIMESTAMP`.
       - `revokeAllUserSessions`: Revokes all active sessions for a user upon security events.
     - `apps/backend/src/modules/auth/devices.repository.js`:
       - `registerDevice`: Records new client device (`platform`, `deviceName`, `applicationVersion`, `pushTokenReference`, `trustState`).
       - `findDeviceById`: Looks up device by UUID.
       - `findDevicesForUser`: Lists user devices ordered by `last_seen_at DESC`.
       - `updateDeviceTrustState`: Updates device trust state (`TRUSTED`, `UNTRUSTED`, `REVOKED`).
   - Comprehensive repository test suite:
     - `apps/backend/tests/repositories.test.js`: 13 tests covering parameterized queries, clean domain mapping, validation errors, soft-delete filtering, atomic multi-step transactions, transaction rollbacks on failure, tenant isolation enforcement, active session token verification, and device registration/trust updates.
   - Verified with: `npm test` (92/92 tests passing across 11 test files), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

---

## Phase 2: Database Foundation — COMPLETED & VERIFIED

### Phase 2 Summary

- **Database Connection Layer (Task 2.1)**: Production-grade `pg` connection pool with idle error listeners, credential sanitization, transaction management (`withTransaction`), pool metrics, and Fastify health check integration.
- **Migration System (Task 2.2)**: Authoritative runner powered by `node-pg-migrate` supporting programmatic and CLI execution, single-transaction atomic migrations, explicit tracking table (`pgmigrations`), and reversible `-- Up Migration` / `-- Down Migration` scripts.
- **Core Relational Tables (Task 2.3)**: Foundational tables (`users`, `workspaces`, `workspace_memberships`, `devices`, `sessions`) created strictly matching `docs/7.DATABASE-DESIGN.md`.
- **Schema Invariants & Constraints (Task 2.4)**: UUIDv4 primary keys (`uuid_generate_v4()`), timestamps, soft-delete fields, foreign keys with `ON DELETE RESTRICT` / `CASCADE` / `SET NULL`, unique active email indexes, unique membership constraints, and domain check constraints.
- **Data Access Layer & Repositories (Task 2.5)**: Pure `pg` parameterized SQL repositories (`users.repository.js`, `workspaces.repository.js`, `sessions.repository.js`, `devices.repository.js`) supporting ACID transactions and tenant isolation with strictly zero ORM.

---

## Comprehensive Verification Results (Phase 2 Final)

| Verification Check        | Scope / Command                        | Result     | Metrics / Details                                                             |
| ------------------------- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| **JavaScript-Only Guard** | `npm run check:js-only`                | **PASSED** | 0 TypeScript files across whole repository                                    |
| **Linter Verification**   | `npm run lint`                         | **PASSED** | 0 errors, 0 warnings across all files                                         |
| **Formatting Check**      | `npm run format:check`                 | **PASSED** | All matched files use Prettier style                                          |
| **Shared Unit Tests**     | `packages/shared/tests/*.test.js`      | **PASSED** | 20/20 tests passed (schemas + datetime)                                       |
| **Backend Tests**         | `apps/backend/tests/*.test.js`         | **PASSED** | 73/73 tests passed (live + db + migrator + schema + repos + health + modules) |
| **Desktop Tests**         | `apps/desktop/tests/*.test.js`         | **PASSED** | 3/3 tests passed (security + IPC whitelist)                                   |
| **Mobile Tests**          | `apps/mobile/tests/*.test.js`          | **PASSED** | 6/6 tests passed (tabs + env + API client)                                    |
| **Web Shell Tests**       | `apps/web/tests/*.test.jsx`            | **PASSED** | 6/6 tests passed (routes + layout + error boundary)                           |
| **Monorepo Test Suite**   | `npm test`                             | **PASSED** | **108/108 tests passed** across 12 test files                                 |
| **Web Production Build**  | `npm run build -w @workaholic/web`     | **PASSED** | Production bundle generated in 1.87s                                          |
| **Desktop Shell Check**   | `npm run check -w @workaholic/desktop` | **PASSED** | Scaffold verified                                                             |
| **Mobile Shell Check**    | `npm run check -w @workaholic/mobile`  | **PASSED** | Scaffold verified                                                             |

---

## Phase 2 Post-Completion Live Database Audit (2026-09-06)

- **Audit Classification**: **A. VERIFIED COMPLETE**
- **Live Environment**:
  - Docker Desktop backend engine initiated.
  - PostgreSQL container `workaholic-postgres` running `postgres:16-alpine` (PostgreSQL 16.15 on x86_64-pc-linux-musl, Alpine 15.2.0).
  - Port `5432` open, healthy, and responsive.
  - Database: `workaholic_dev`, User: `workaholic`.
- **Live Migration Lifecycle**:
  - Clean state verified on empty database.
  - `migrate:up` successfully applied `1725628800000_initial_extensions` and `1725628801000_create_core_tables`.
  - Migration tracking verified against `pgmigrations` table.
  - `migrate:status` verified zero pending migrations.
  - `migrate:down` tested twice: successfully rolled back core tables in dependency order, then rolled back extensions cleanly.
  - `migrate:up` re-executed: clean recreation from empty state confirmed.
- **Live Schema Verification (`information_schema` & `pg_catalog`)**:
  - Confirmed 5 tables: `users`, `workspaces`, `workspace_memberships`, `devices`, `sessions`.
  - Confirmed 44 columns, exact data types (`uuid`, `varchar`, `timestamptz`, `jsonb`, `text`), defaults (`uuid_generate_v4()`, `CURRENT_TIMESTAMP`, `'{}'::jsonb`), and nullability rules.
  - Confirmed 20 database constraints:
    - Primary keys on all 5 tables (`uuid_generate_v4()`).
    - Foreign keys with strict actions: `workspaces.owner_user_id` ON DELETE RESTRICT; `workspace_memberships.workspace_id` ON DELETE CASCADE; `workspace_memberships.user_id` ON DELETE CASCADE; `devices.user_id` ON DELETE CASCADE; `sessions.user_id` ON DELETE CASCADE; `sessions.device_id` ON DELETE SET NULL.
    - Composite uniqueness on `workspace_memberships(workspace_id, user_id)` and unique token on `sessions(session_token_hash)`.
    - Domain CHECK constraints on `workspace_type`, `role`, `status`, `platform`, `trust_state`, `session_type`.
  - Confirmed 20 database indexes:
    - Partial unique index on `users (lower(email)) WHERE deleted_at IS NULL`.
    - Partial index on `sessions (session_token_hash) WHERE revoked_at IS NULL`.
    - Soft-delete indexes on `users.deleted_at` and `workspaces.deleted_at`.
    - Foreign key traversal indexes on all parent references.
- **Live Invariant & Constraint Tests (`database-live.test.js`)**:
  - Case-insensitive duplicate email rejection verified.
  - Email reuse allowed after soft-delete verified.
  - Invalid CHECK constraint values on all domain columns rejected by PostgreSQL.
  - Composite membership uniqueness enforced.
  - Foreign key violations rejected by PostgreSQL.
  - Workspace owner deletion prevented by ON DELETE RESTRICT.
  - Membership cascading deletion on workspace deletion verified.
  - Session device_id set to NULL on device deletion verified.
- **Live Repository & Tenant Isolation Tests**:
  - Users repository: Full CRUD and soft-delete filtering verified against live database.
  - Workspaces repository: Atomic workspace + owner membership transaction verified; strict multi-tenant isolation proven between User A and User B.
  - Sessions & Devices repository: Device registration, trust state updates, active session queries, last_seen_at updates, single session revocation, and user-wide session revocation verified.
- **Live Transaction Semantics**:
  - Atomic multi-table commits verified.
  - Full rollback on error verified leaving zero orphan rows.
- **Corrections Made During Live Audit**:
  - Fixed PostgreSQL parameter type deduction issue in `addWorkspaceMembership` ([workspaces.repository.js](file:///c:/Vault%201/Frosty%20Coder/Projects/Workaholic-App/apps/backend/src/modules/workspaces/workspaces.repository.js)) where `$4` was reused in both column assignment and inline `CASE` expression. Resolved by explicitly computing `joinedAt` in JavaScript and binding as `$5`.
  - Added `migrate:status` script to [package.json](file:///c:/Vault%201/Frosty%20Coder/Projects/Workaholic-App/apps/backend/package.json) and implemented status checking in [migrator.js](file:///c:/Vault%201/Frosty%20Coder/Projects/Workaholic-App/apps/backend/src/core/migrator.js).
- **Final Phase 2 Status**: **VERIFIED COMPLETE** (108/108 tests passing, live PostgreSQL 16 proven).

---

## Phase 3: Backend Foundation (In Progress)

### Completed Tasks

1. **Task 3.1 — Request Pipeline & Validation**:
   - Reusable Zod validation hook created at `apps/backend/src/core/validation.js`:
     - `validateRequest({ params, query, body, headers })` preValidation hook for Fastify.
     - Validates and coerces parameters, query strings, and payloads using Zod schemas.
     - Maps schema errors to field-level details `{ field: message }` conforming strictly to `docs/15.API-SPECIFICATION.md` Section 18.
     - Decorates request context with `request.validated = { params, query, body }`.
   - Payload sanitization & safety:
     - Global Fastify error handler updated in `apps/backend/src/app.js` to normalize malformed JSON payloads and content-type parse errors into safe 400 `VALIDATION_ERROR` responses, preventing internal V8 parser and syntax leaks.
   - Standard response envelope compliance:
     - Verified `sendSuccess` helper for single resources (`{ data: ... }`) and collections with pagination (`{ data: [...], pagination: { ... } }`).
     - Request correlation ID (`x-request-id`) generated or propagated through request headers, response headers, and error response envelopes.

2. **Task 3.2 — Error Model Hierarchy**:
   - Complete domain error model established in `apps/backend/src/core/errors.js`:
     - Base `AppError` carrying `code`, `message`, `statusCode`, and optional `fields`.
     - `ValidationError` (400, `VALIDATION_ERROR`).
     - `AuthenticationRequiredError` (401, `AUTHENTICATION_REQUIRED`).
     - `AuthenticationFailedError` (401, `AUTHENTICATION_FAILED`).
     - `ForbiddenError` (403, `FORBIDDEN`).
     - `NotFoundError` (404, `NOT_FOUND`).
     - `ConflictError` (409, `CONFLICT`).
     - `SyncConflictError` (409, `SYNC_CONFLICT`).
     - `RateLimitedError` (429, `RATE_LIMITED`).
     - `ExternalServiceError` (502, `EXTERNAL_SERVICE_ERROR`).
     - `TemporaryFailureError` (503, `TEMPORARY_FAILURE`).
     - `InternalError` (500, `INTERNAL_ERROR`).
   - Global error serialization:
     - `formatErrorResponse(error, requestId)` sanitizes unexpected 500 errors to a safe generic message, strictly preventing database credentials, host strings, and internal stack traces from leaking to clients.
   - Comprehensive test suite:
     - `apps/backend/tests/request-pipeline.test.js`: 17 tests verifying request validation, param coercion, malformed JSON handling, standard envelopes, every AppError subclass, error sanitization, and request ID propagation.
   - Verified with: `npm test` (125/125 tests passing across 13 test files), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

3. **Task 3.3 — API Structure & Service Layer Architecture**:
   - Clean architectural separation established: Fastify Routes (HTTP transport) -> Domain Services (business rules & transactions) -> Repositories (pure parameterized SQL).
   - Core domain services implemented:
     - `UsersService` (`apps/backend/src/modules/users/users.service.js`):
       - `getUserProfile`: Enforces existence and soft-delete filtering (`NotFoundError`).
       - `createUser`: Enforces duplicate email prevention (`ConflictError`).
       - `updateUserProfile`: Enforces collision checks on email changes and returns updated domain model.
       - `deleteUser`: Safely soft-deletes active users.
     - `WorkspacesService` (`apps/backend/src/modules/workspaces/workspaces.service.js`):
       - `getUserWorkspaces`: Returns workspaces for active user memberships.
       - `getWorkspaceById`: Enforces strict tenant isolation; returns `NotFoundError` for non-members to prevent leaking private workspace existence.
       - `createWorkspace`: Atomically provisions workspace and sets creator as `OWNER`.
       - `getWorkspaceMembers`: Returns active workspace members for authorized requesters.
       - `addMember`: Enforces role checks (`OWNER` or `ADMIN` only), forbids `ADMIN` from creating owners or modifying other admins/owners.
       - `updateMemberRole`: Enforces role downgrade/upgrade security and protects workspace owner.
     - `AuthService` (`apps/backend/src/modules/auth/auth.service.js`):
       - `validateSession`: Validates active token hash, verifies expiry/revocation, updates `last_seen_at`.
       - `revokeSession` & `revokeAllUserSessions`: Explicit revocation for single session or all sessions on security events.
       - `registerDevice` & `updateDeviceTrust`: Registers client devices and maintains device trust states.
   - Route and validation integration:
     - `users.routes.js`: Connected `GET /me` and `PATCH /me` to `usersService` with `updateUserSchema` validation.
     - `workspaces.routes.js`: Connected `GET /`, `POST /`, `GET /:id`, `GET /:id/members`, and `POST /:id/members` to `workspacesService` with server-side identity enforcement (zero client trust).
   - Comprehensive test suite:
     - `apps/backend/tests/services.test.js`: 28 unit and integration tests verifying `UsersService`, `WorkspacesService`, `AuthService`, domain rules, role permissions, and route-to-service flow.
   - Verified with: `npm test` (153/153 tests passing across 14 test files), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

4. **Task 3.4 — Authorization Boundary & Tenant Isolation**:
   - Central authorization system established in `apps/backend/src/core/authorization.js`:
     - Role hierarchy and ranks: `OWNER` (40) > `ADMIN` (30) > `MEMBER` (20) > `VIEWER` (10) conforming to `docs/11.PERMISSIONS-MODEL.md`.
     - `hasMinimumRole(userRole, requiredRole)`: Pure hierarchical authorization evaluation.
     - `assertCanManageRole(requesterRole, targetCurrentRole, newRole)`: Enforces role assignment safety rules, prevents non-admins from managing roles, prevents admins from modifying owners/admins or granting owner, and prevents tampering with owner roles.
     - `assertResourceTenantIsolation(resource, workspaceId)`: IDOR and tenant boundary guard preventing cross-workspace resource access.
     - `requireWorkspaceAccess(options)`: Fastify preHandler hook establishing verified server-side workspace context:
       - Strictly rejects unauthenticated requests (401 `AUTHENTICATION_REQUIRED`).
       - Looks up membership directly from authoritative repository with zero client trust.
       - Rejects non-members and inactive/suspended/invited members with 404 `NOT_FOUND` to prevent leaking existence of private workspaces (`docs/15.API-SPECIFICATION.md` Section 17).
       - Enforces role limits via `allowedRoles` or `minimumRole`, rejecting unauthorized members with 403 `FORBIDDEN`.
       - Attaches verified `request.workspace` context containing `{ id, role, status, joinedAt }`.
   - Dedicated test suite:
     - `apps/backend/tests/authorization.test.js`: 14 tests verifying role hierarchy ranking, minimum role checks, role management constraints, IDOR tenant isolation checks, Fastify hook unauthenticated rejection, active membership validation, non-member 404 shielding, suspended member rejection, admin-only gating, and owner-only protection.
   - Verified with: `npm test` (167/167 tests passing across 15 test files), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

5. **Task 3.5 — Transaction Utilities & ACID Boundaries**:
   - Enhanced transaction utilities implemented in `apps/backend/src/core/db.js`:
     - Extended `withTransaction(workFn, poolOrClientOrOptions, maybeOptions)`:
       - Supports configurable isolation levels: `READ COMMITTED`, `REPEATABLE READ`, `SERIALIZABLE` matching concurrency needs (e.g. booking, calendar conflict prevention).
       - Supports `readOnly: true` transaction mode.
       - Transparent re-entrant participation when an active transaction client is passed, allowing atomic multi-service composition without redundant inner `BEGIN`/`COMMIT` calls.
       - Automatic client checkout, `BEGIN`, `COMMIT`, `ROLLBACK` on error, and guaranteed client release in `finally` block.
     - Implemented `withSavepoint(client, workFn, savepointName)`:
       - Safe nested sub-transactions with `SAVEPOINT`, `RELEASE SAVEPOINT`, and `ROLLBACK TO SAVEPOINT`.
       - Injection-safe identifier validation for savepoint names.
       - Allows sub-steps to fail and roll back partially without aborting outer transaction.
   - Comprehensive test suite:
     - `apps/backend/tests/transactions.test.js`: 10 unit and live PostgreSQL integration tests covering successful commit, error rollback, re-entrant propagation, isolation level configuration, invalid isolation level rejection, savepoint commit, savepoint partial rollback, injection prevention, live PostgreSQL `REPEATABLE READ` transaction verification, and live PostgreSQL savepoint partial rollbacks.
   - Verified with: `npm test` (177/177 tests passing across 16 test files), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

6. **Task 3.6 — Background Job Foundation**:
   - Authoritative PostgreSQL-backed queue infrastructure established conforming strictly to `AGENTS.md` and `docs/6.SYSTEM-ARCHITECTURE.md` Section 35, 36, 64 (strictly zero Redis / Kafka / microservices):
     - Migration `1725628802000_create_background_jobs.sql`:
       - Created `background_jobs` table: `id` (UUID PK default `uuid_generate_v4()`), `queue` (VARCHAR default 'default'), `job_type` (VARCHAR), `payload` (JSONB default '{}'), `status` ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'), `priority` (INT), `run_at` (TIMESTAMPTZ), `attempts` (INT), `max_attempts` (INT), `locked_at`, `locked_by`, `last_error`, `created_at`, `updated_at`, `completed_at`.
       - High-performance partial index `idx_background_jobs_poll ON background_jobs (queue, priority DESC, run_at ASC) WHERE status = 'PENDING'`.
       - Status and queue metrics indexes for efficient observability.
       - Clean, atomic reversible `-- Down Migration`.
       - Applied and verified against live PostgreSQL 16 database.
     - Shared package constants and schemas:
       - Exported frozen `JOB_STATUS` in `@workaholic/shared`.
       - Exported `createJobSchema` in `@workaholic/shared`.
     - Data access repository (`apps/backend/src/core/jobs.repository.js`):
       - `enqueueJob`: Inserts parameterized job record into PostgreSQL.
       - `fetchNextPendingJob`: Atomic concurrency lock using `SELECT ... FOR UPDATE SKIP LOCKED` inside transactions, guaranteeing zero duplicate processing across concurrent workers and zero lock contention.
       - `completeJob`: Sets status `COMPLETED`, records `completed_at`, and clears locks.
       - `failJob`: Evaluates attempts vs maxAttempts; schedules retry with future backoff timestamp if attempts < maxAttempts, or marks terminal `FAILED` status.
       - `getQueueMetrics`: Aggregates job counts by status for health probes and dashboards.
     - Queue worker engine (`apps/backend/src/core/queue.js`):
       - `JobQueue`: Managed worker instance supporting `enqueue`, `registerHandler`, `processNext`, and `getMetrics`.
       - Catches handler errors safely, never crashes worker process, and never leaves unreleased database locks.
   - Comprehensive test suite:
     - `apps/backend/tests/queue.test.js`: 10 unit and live PostgreSQL 16 integration tests covering job enqueue, handler execution, missing handler failure, retry backoff calculation, live PostgreSQL `FOR UPDATE SKIP LOCKED` concurrent non-blocking worker polling, completion timestamps, and terminal max-attempts failure.
   - Verified with: `npm test` (187/187 tests passing across 17 test files), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

7. **Task 3.7 — Observability Foundation**:
   - Observability infrastructure implemented conforming to `docs/6.SYSTEM-ARCHITECTURE.md` Section 58 & `docs/15.API-SPECIFICATION.md` Section 20:
     - Request execution timing (`x-response-time`):
       - High-resolution `process.hrtime.bigint()` hook on request start attached to all API responses in milliseconds (`x.xxms`).
     - Request correlation (`x-request-id`):
       - Seamless correlation across incoming client headers, outgoing response headers, structured logs, and error envelopes.
     - Structured JSON completion logging:
       - `onResponse` Fastify hook recording method, url, status code, duration in ms, requestId, authenticated userId, and workspaceId without leaking passwords, query parameters, or token secrets.
     - Enhanced health and readiness endpoints in `apps/backend/src/modules/health/health.routes.js`:
       - `GET /api/v1/health`: Liveness probe for container orchestrators.
       - `GET /api/v1/health/db`: Database connectivity and PostgreSQL pool metrics (`totalCount`, `idleCount`, `waitingCount`).
       - `GET /api/v1/health/queue`: Background job queue metrics (counts by status: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
       - `GET /api/v1/health/ready`: Comprehensive traffic readiness probe validating database connection and queue availability with graceful 503 `TEMPORARY_FAILURE` fallback on database unavailability.
   - Comprehensive test suite:
     - `apps/backend/tests/observability.test.js`: 8 unit and integration tests verifying `x-request-id` propagation, `x-response-time` header formatting, liveness probe, database probe with pool metrics, queue metrics probe, combined readiness probe, and structured JSON request completion logging.
   - Verified with: `npm test` (195/195 tests passing across 18 test files), `npm run lint` (0 errors, 0 warnings), `npm run format:check` (Prettier clean), `npm run check:js-only` (Passed).

---

## Phase 3: Backend Foundation — COMPLETED & VERIFIED

### Phase 3 Summary

- **Request Pipeline & Validation (Task 3.1)**: Reusable Zod preValidation hook (`core/validation.js`), standard success/error envelopes, request ID correlation (`x-request-id`), and malformed payload normalization.
- **Error Model Hierarchy (Task 3.2)**: Comprehensive application error classes (`ValidationError`, `AuthenticationRequiredError`, `AuthenticationFailedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `SyncConflictError`, `RateLimitedError`, `ExternalServiceError`, `TemporaryFailureError`, `InternalError`) with strict sanitization preventing database credential or stack trace leakage.
- **API Structure & Service Layer (Task 3.3)**: Full architectural separation: Routes (HTTP transport) -> Domain Services (`UsersService`, `WorkspacesService`, `AuthService`) -> Repositories (pure parameterized SQL with zero ORM).
- **Authorization Boundary (Task 3.4)**: Server-side authorization system (`core/authorization.js`) enforcing role hierarchy ranks, role management assertions, IDOR tenant isolation (`assertResourceTenantIsolation`), and `requireWorkspaceAccess` Fastify hook shielding private workspaces with 404 `NOT_FOUND` against non-members.
- **Transaction Utilities (Task 3.5)**: Enhanced `withTransaction` supporting configurable isolation levels (`READ COMMITTED`, `REPEATABLE READ`, `SERIALIZABLE`), `readOnly` mode, re-entrant client propagation, and `withSavepoint` nested transaction boundaries verified against live PostgreSQL 16.
- **Background Job Foundation (Task 3.6)**: Migration `1725628802000_create_background_jobs.sql`, `jobs.repository.js`, and `JobQueue` worker engine powered by PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` with concurrency, priority queues, and retry backoff.
- **Observability Foundation (Task 3.7)**: Structured JSON completion logging, `x-response-time` headers, and layered health/readiness endpoints (`/health`, `/health/db`, `/health/queue`, `/health/ready`).
