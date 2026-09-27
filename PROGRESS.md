# Workaholic Implementation Progress

## Status Overview

- **Current Phase**: Phase 10.13 — Recurring Task Occurrence-State Remediation (COMPLETED & VERIFIED)
- **Current Task**: Phase 10.13 Complete — Awaiting Authorization for Phase 11
- **Overall Project Status**: Phase 0 through Phase 10.13 Complete & Verified
- **Last Updated**: 2026-09-27
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

---

---

## Phase 4: Authentication and Identity — RECONCILED, COMPLETED & VERIFIED

### Architectural Reconciliation & Final Correction

During Phase 4 review, an architectural discrepancy was detected: the initial implementation had introduced direct Google OpenID Connect verification (`GoogleAuthService`) calling `POST /api/v1/auth/google`. This conflicted with the authoritative repository architecture (`docs/6.SYSTEM-ARCHITECTURE.md` §13, 14, 66; `docs/1.project.md` §5, 6; `docs/2.requirements.md` Req 22; and `docs/phase-wise-plan.md` §7), which establishes:

1. **Firebase Authentication as the Authentication Authority**:
   Answers strictly _"Who is this user?"_ through client-side Firebase Auth and backend Firebase ID token verification via `firebase-admin`.
2. **External Identity Mapping to Native Workaholic User**:
   Maps verified Firebase identity (`provider = 'FIREBASE'`, `provider_subject = <firebase_uid>`) to the internal Workaholic User UUID.
3. **Native Workaholic Session Authority**:
   Application sessions are managed authoritatively by Workaholic (`sessions` table with SHA-256 token hashing, 256-bit entropy, device associations, security audit trail).
4. **Google API OAuth Boundary Kept Strictly Independent**:
   Google Calendar, Tasks, and Drive authorization remains a completely separate OAuth2 lifecycle (`oauth-boundary.service.js` with AES-256-GCM encrypted credentials). Disconnecting Google API integrations NEVER deletes or alters the Workaholic account or active sessions.

### Reconciled Implementation Details

1. **Firebase Authentication Service (`apps/backend/src/modules/auth/firebase-auth.service.js`)**:
   - Built on official `firebase-admin` SDK token verification.
   - Extracts normalized identity claims: `{ provider: 'FIREBASE', subject: uid, email, emailVerified, displayName, picture, signInProvider }`.
   - Never trusts client-supplied identity fields.
   - Preserves `emailVerified` as verified token metadata according to authoritative specifications without inventing arbitrary rejection rules.
   - Includes test/emulator support with `createMockFirebaseIdToken()` strictly prohibited in production mode (`config.env === 'production'`).
   - Clean removal of obsolete direct Google OIDC verifier (`google-auth.service.js`).

2. **Account Bootstrap Engine with Concurrency Guard (`apps/backend/src/modules/auth/account-bootstrap.service.js`)**:
   - Authoritative identity key: Verified Firebase UID under `provider = 'FIREBASE'`.
   - Atomic bootstrap within transaction: Provisions Workaholic User + Personal Workspace + OWNER Membership + External Identity link.
   - Concurrency-safe: Simultaneous first-login requests for the same Firebase UID safely resolve to the identical single user and workspace without creating duplicate entities or throwing unhandled errors (verified against live PostgreSQL 16).
   - Identity Isolation: Firebase UID A and Firebase UID B remain strictly isolated; changing email does not alter external identity mapping.

3. **Canonical Authentication API (`apps/backend/src/modules/auth/auth.routes.js`)**:
   - `POST /api/v1/auth/session` (canonical): Exchanges verified Firebase ID token for native Workaholic session, sets HttpOnly cookie, and returns `{ token, user, session, isNewUser }`.
   - `POST /api/v1/auth/firebase` (alias): Identical service execution for clients requesting explicit Firebase exchange.
   - Clean removal of `POST /api/v1/auth/google` as an authentication endpoint.
   - Google API OAuth routes remain dedicated to Calendar/Tasks/Drive:
     - `GET /api/v1/auth/google/authorize`: Scoped consent URL.
     - `POST /api/v1/auth/google/callback`: Code exchange with AES-256-GCM encrypted credential persistence.
     - `GET /api/v1/auth/google/status`: Integration connection status.
     - `DELETE /api/v1/auth/google`: Disconnects Google integration without affecting user account or session.

4. **Shared Schemas (`packages/shared/src/schemas/index.js`)**:
   - `firebaseAuthInputSchema`: Validates `idToken` and optional `device` parameters.
   - `authSessionExchangeInputSchema`: Alias for canonical session exchange.

---

### Verification Results

All quality gates and live database tests pass:

| Verification Step        | Command                                               | Result     | Notes                                           |
| ------------------------ | ----------------------------------------------------- | ---------- | ----------------------------------------------- |
| JavaScript-Only Guard    | `npm run check:js-only`                               | **PASSED** | 0 TypeScript files found across repository      |
| Linter Verification      | `npm run lint`                                        | **PASSED** | 0 errors, 0 warnings across all workspaces      |
| Code Formatting Check    | `npm run format:check`                                | **PASSED** | All matched files use Prettier code style       |
| Test Suite (Unit & HTTP) | `npx vitest run apps/backend/tests/auth.test.js`      | **PASSED** | 30/30 auth unit and HTTP tests passed           |
| Test Suite (Live DB)     | `npx vitest run apps/backend/tests/auth-live.test.js` | **PASSED** | 8/8 real PostgreSQL 16 integration tests passed |
| Monorepo Test Suite      | `npm test`                                            | **PASSED** | 233/233 tests passed across 20 test files       |
| Web Production Build     | `npm run build -w @workaholic/web`                    | **PASSED** | Production bundle generated in 1.78s            |
| Desktop Package Scaffold | `npm run check -w @workaholic/desktop`                | **PASSED** | Electron scaffold verified                      |
| Mobile Package Scaffold  | `npm run check -w @workaholic/mobile`                 | **PASSED** | React Native / Expo scaffold verified           |

| Live Database Migrations | `npm run migrate:up -w @workaholic/backend` | **PASSED** | Applied, rolled back, and reapplied on PG 16 |

---

### Phase 4 Summary

- **Authentication & Identity**: Google OpenID Connect token verification establishes user identity without granting Google API scopes. Workaholic UUID is authoritative internally.
- **Account Bootstrap**: First-time login provisions user profile, default personal workspace, and OWNER membership atomically in a transaction.
- **Session Security**: 256-bit cryptographically secure randomness, SHA-256 token hashing, partial index active lookup, automatic `last_seen_at` tracking, HttpOnly cookie and Bearer transport, and explicit revocation.
- **Device Management**: Client tracking across Web, Windows, and Android with trust state management and cascading remote device session termination.
- **Security Audit Trail**: Append-oriented audit logging with automatic credential/token redaction.
- **OAuth Boundary**: Separate consent flows and encrypted server-side credential storage for Google Calendar, Tasks, and Drive.
- **Global Invariants Preserved**: Zero TypeScript, zero ORMs, PostgreSQL 16 authoritative, zero Redis/Kafka/microservices.

---

## Phase 5: Task Management — COMPLETED & VERIFIED

### Completed Tasks

1. **Task 5.1 & 5.2 — Task Domain Database Foundation & Invariants**:
   - Migration `1725628804000_create_task_tables.sql` applied and verified against live PostgreSQL 16.15:
     - `tasks`: Core table matching `docs/7.DATABASE-DESIGN.md`:
       - `id` (UUID PK default `uuid_generate_v4()`)
       - `workspace_id` (FK -> `workspaces(id)` ON DELETE CASCADE)
       - `project_id` (UUID nullable, clean extension point for Phase 6)
       - `board_id` (UUID nullable, clean extension point for Phase 6)
       - `board_column_id` (UUID nullable, clean extension point for Phase 6)
       - `parent_task_id` (UUID nullable, FK self-referential -> `tasks(id)` ON DELETE CASCADE)
       - `title` (VARCHAR(255) NOT NULL with `chk_tasks_title_not_empty`)
       - `description` (TEXT nullable)
       - `status` (VARCHAR(32) NOT NULL DEFAULT 'TODO' with `chk_tasks_status`)
       - `priority` (VARCHAR(8) NOT NULL DEFAULT 'P3' with `chk_tasks_priority` P0–P4)
       - `start_at` (TIMESTAMPTZ nullable)
       - `due_at` (TIMESTAMPTZ nullable)
       - `estimated_duration` (INTEGER nullable, minutes)
       - `completed_at` (TIMESTAMPTZ nullable)
       - `created_by` (FK -> `users(id)` ON DELETE RESTRICT)
       - `assigned_to` (UUID nullable, FK -> `users(id)` ON DELETE SET NULL)
       - `version` (INTEGER NOT NULL DEFAULT 1 with `chk_tasks_version` > 0)
       - `created_at`, `updated_at`, `deleted_at` (TIMESTAMPTZ)
     - `labels`: Workspace-scoped tags (`id`, `workspace_id`, `name`, `color`, `description`, timestamps, `uq_labels_workspace_name`).
     - `task_labels`: Composite join table (`task_id`, `label_id`, `created_at`, PK composite).
     - `task_dependencies`: Directional dependencies (`id`, `workspace_id`, `task_id`, `depends_on_task_id`, `dependency_type`, `chk_task_dependencies_not_self`, `uq_task_dependencies_pair`).
     - `task_links`: Reference links (`id`, `task_id`, `url`, `title`, `link_type`, `created_at`).
     - `task_work_blocks`: Relational work block foundation (`id`, `task_id`, `calendar_id`, `start_at`, `end_at`, `timezone`, `status`, `chk_task_work_blocks_time`).
     - Indexes: `idx_tasks_workspace_lookup`, `idx_tasks_status`, `idx_tasks_priority`, `idx_tasks_due_at` (partial index for active tasks), `idx_tasks_parent`, `idx_tasks_creator`, `idx_tasks_assignee`, and `idx_tasks_search_title` (GIN tsvector for full-text search).
     - Reversibility: Full atomic `-- Down Migration` tested UP -> DOWN -> UP on PostgreSQL 16.

2. **Task 5.3 — Shared Task Contracts (`@workaholic/shared`)**:
   - `packages/shared/src/constants/index.js`:
     - `TASK_STATUS`: `TODO`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, `CANCELLED`, `DONE`.
     - `TASK_PRIORITY`: `P0` (Critical), `P1` (Urgent), `P2` (High), `P3` (Medium), `P4` (Low), with backward-compatible legacy aliases.
     - `DEPENDENCY_TYPE`: `BLOCKS`, `BLOCKED_BY`, `DEPENDS_ON`, `RELATED_TO`.
     - `TASK_LINK_TYPE`: `EXTERNAL`, `INTERNAL`.
     - `WORK_BLOCK_STATUS`: `SCHEDULED`, `ACTIVE`, `COMPLETED`, `CANCELLED`.
   - `packages/shared/src/schemas/index.js`:
     - `createTaskSchema`, `updateTaskSchema`, `taskQuerySchema`, `createSubtaskSchema`, `createDependencySchema`, `createTaskLinkSchema` (strict regex filtering out `javascript:`, `data:`, `vbscript:`), `createLabelSchema`, `updateLabelSchema`, `assignLabelSchema`, `createWorkBlockSchema`.
   - Unit tests in `packages/shared/tests/schemas.test.js`: 21/21 tests passing.

3. **Task 5.4 — Task Data Repositories**:
   - `apps/backend/src/modules/tasks/tasks.repository.js`:
     - Parameterized SQL with zero ORM; supports external transaction client propagation.
     - `createTask`, `findTaskById`, `listTasks` (bounded filtering, sorting, cursor/offset pagination), `updateTask` with atomic optimistic concurrency version checking, `softDeleteTask`, `restoreTask`, `findSubtasks`, `getTaskAncestors` (recursive SQL CTE).
   - `apps/backend/src/modules/tasks/labels.repository.js`: CRUD for workspace labels and associations.
   - `apps/backend/src/modules/tasks/dependencies.repository.js`: Direct and graph queries for task dependencies.
   - `apps/backend/src/modules/tasks/links.repository.js`: External and internal task link management.
   - `apps/backend/src/modules/tasks/work-blocks.repository.js`: Work block relational foundation.

4. **Task 5.5 to 5.16 — Domain Logic & Business Rules (`tasks.service.js`)**:
   - **Task Independence**: Tasks exist independently in Inbox without requiring project or board.
   - **Independent Completion & Reopening**: Completing all subtasks does not auto-complete parent; parent completion does not auto-complete children. Reopening restores incomplete state without mutating due dates.
   - **Hierarchy & Subtask Cycle Prevention**: Subtasks retain full task capabilities; self-parenting and circular ancestor trees are strictly rejected via ancestor graph validation.
   - **Priority & Status Independence**: Changing priority never mutates status; changing status never mutates priority.
   - **Deterministic Overdue Calculation**: Evaluates `status !== COMPLETED && due_at < NOW()` without mutating due dates or inventing false database statuses.
   - **Dependency Cycle Prevention**: Breadth-first search (BFS) graph reachability prevents transitive circular chains (e.g., A blocks B, B blocks C, C blocks A).
   - **Safe Link Protocol Validation**: Rejects dangerous schemes (`javascript:`, `data:`) while supporting HTTPS, HTTP, mailto, and relative internal links.
   - **Optimistic Concurrency**: Server checks current `version`; concurrent stale updates throw 409 `CONFLICT`.
   - **Search Foundation**: Fast title search using PostgreSQL parameterized `ILIKE` and full-text GIN indexing.

5. **Task 5.17 to 5.20 — API Routes & Authorization**:
   - Endpoints in `apps/backend/src/modules/tasks/tasks.routes.js`:
     - `GET /api/v1/tasks`: Bounded collection with filters (status, priority, labelId, overdue, search).
     - `POST /api/v1/tasks`: Create task in workspace context.
     - `GET /api/v1/tasks/:id`: Retrieve single task with subtasks, labels, dependencies, links.
     - `PATCH /api/v1/tasks/:id`: Update task with optimistic concurrency.
     - `DELETE /api/v1/tasks/:id`: Soft-delete task.
     - `POST /api/v1/tasks/:id/restore`: Restore soft-deleted task.
     - `POST /api/v1/tasks/:id/complete`: Explicit completion transition.
     - `POST /api/v1/tasks/:id/reopen`: Explicit reopen transition.
     - `GET / POST /api/v1/tasks/:id/subtasks`: Subtask operations.
     - `GET / POST / DELETE /api/v1/tasks/:id/dependencies`: Dependency operations.
     - `POST / DELETE /api/v1/tasks/:id/labels`: Label attachment/detachment.
     - `GET / POST / DELETE /api/v1/tasks/:id/links`: Link operations.
     - `GET / POST / DELETE /api/v1/tasks/:id/work-blocks`: Work block operations.
     - `GET / POST / DELETE /api/v1/tasks/labels`: Workspace labels CRUD.
   - Authorization: Tenant isolation enforced on every query; cross-workspace access or mutation rejected.

6. **Task 5.21 — Web Task UI (`apps/web`)**:
   - `TasksPage.jsx`: Full-featured task management cockpit with search, priority filters (P0–P4), status tabs (All, To Do, In Progress, Blocked, Completed), overdue filter toggle, localized loading states, and accessible empty states.
   - `TaskItem.jsx`: Accessible task card with role="checkbox", aria-checked, priority badges, overdue badges, due date formatting, and subtask counters.
   - `CreateTaskModal.jsx`: Quick capture modal with autofocus, keyboard accessibility (Esc/Enter), priority selector, due date/time, and estimated duration.
   - `TaskDetailDrawer.jsx`: Side drawer for inspection, editing, optimistic subtask checklist management, and concurrency conflict notifications.
   - `tasks.api.js`: Standardized API client for tasks, subtasks, and labels.

7. **Task 5.22 — Testing Matrix Implementation**:
   - `apps/backend/tests/tasks.test.js`: 24 unit/mock tests.
   - `apps/backend/tests/tasks-live.test.js`: 20 live PostgreSQL 16 tests covering migrations, constraints, optimistic concurrency, cycle prevention, tenant isolation, and soft delete/restore.
   - `apps/web/tests/tasks.test.jsx`: 10 web UI tests covering rendering, keyboard accessibility, subtask management, and filtering.
   - `apps/web/tests/app.test.jsx`: 7 route shell tests verifying real TasksPage mounting on `/tasks`.

---

8. **Phase 5 Post-Completion Audit & E2E Verification**:
   - **Status Semantics**: Resolved `DONE` as strict alias for `COMPLETED` in `@workaholic/shared/constants` and normalized in `tasks.service.js`. Confirmed live PostgreSQL constraint `chk_tasks_status` enforces `('TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED')` with zero independent `DONE` state in database.
   - **Today View Integration (`TM-TASK-011`)**: Integrated active task loading, dynamic Focus Task rendering, task completion toggle (`role="checkbox"`, `aria-checked`), strikethrough styling, and Completed Today section into `apps/web/src/pages/TodayPage.jsx`. Added `apps/web/tests/today.test.jsx` (4 unit/DOM tests).
   - **Playwright E2E Browser Testing**: Configured Playwright with pure JS (`playwright.config.js`) and implemented `e2e/tasks.spec.js` (6 tests covering TM-TASK-001, 002, 003, 008, 011, 014). Verified execution in real Chromium headless browser against the Vite web application.

---

## Phase 5 Final Verification Matrix (Post-Audit)

| Verification Check          | Scope / Command                    | Result     | Details                                        |
| --------------------------- | ---------------------------------- | ---------- | ---------------------------------------------- |
| **JavaScript-Only Guard**   | `npm run check:js-only`            | **PASSED** | 0 TypeScript files across whole repository     |
| **Linter Verification**     | `npm run lint`                     | **PASSED** | 0 errors, 0 warnings across all workspaces     |
| **Formatting Check**        | `npm run format:check`             | **PASSED** | 100% Prettier compliant                        |
| **Shared Unit Tests**       | `packages/shared/tests/*.test.js`  | **PASSED** | 21/21 tests passed (schemas + datetime)        |
| **Backend Test Suite**      | `apps/backend/tests/*.test.js`     | **PASSED** | 243/243 tests passed across 18 test files      |
| **Web Test Suite**          | `apps/web/tests/*.test.jsx`        | **PASSED** | 23/23 tests passed (app shell + tasks + today) |
| **Desktop Tests**           | `apps/desktop/tests/*.test.js`     | **PASSED** | 3/3 tests passed (security + IPC whitelist)    |
| **Mobile Tests**            | `apps/mobile/tests/*.test.js`      | **PASSED** | 6/6 tests passed (tabs + env + API client)     |
| **Monorepo Unit/Int Tests** | `npm test`                         | **PASSED** | **296/296 tests passed** across 24 test files  |
| **Playwright E2E Tests**    | `npm run test:e2e`                 | **PASSED** | **7/7 tests passed** in real Chromium browser  |
| **Web Production Build**    | `npm run build -w @workaholic/web` | **PASSED** | Production bundle generated in 1.86s           |
| **Live PG 16 Migration**    | `migrate:up` / `migrate:down`      | **PASSED** | Verified UP, DOWN, UP on PostgreSQL 16.15      |

---

## Phase 5 Summary

- **Phase 5 Classification**: **VERIFIED COMPLETE**
- **Strict Invariants Preserved**: Pure JavaScript/JSX only, zero ORMs, parameterized PostgreSQL queries, zero microservices / Redis / Kafka.
- **Cross-Phase Boundaries**: Projects & Boards (Phase 6), Calendar & Native Work Blocks (Phase 8), Recurrence (Phase 10), Reminders (Phase 11), Google Tasks (Phase 14), Google Drive (Phase 15), Notes (Phase 17), Collaboration (Phase 21) preserved cleanly as nullable extension points.

---

## Phase 6: Projects & Boards

### Completed Tasks

1. **Task 6.1 — Project Domain Foundation**:
   - Schema & Migrations: `migrations/1725628805000_create_project_and_board_tables.sql` establishing `projects` and `project_members` tables with UUID primary keys, workspace-scoped foreign keys (`ON DELETE CASCADE`), lifecycle statuses (`ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`, `CANCELLED`), check constraints, and soft-delete support (`deleted_at`).
   - Repository: `apps/backend/src/modules/projects/projects.repository.js` providing parameterized PostgreSQL queries for CRUD, tenant isolation, search (`ILIKE`), status filtering, pagination, and task count aggregations.
   - Service: `apps/backend/src/modules/projects/projects.service.js` enforcing domain invariants, start/due date consistency (`dueAt >= startAt`), and transaction boundaries.

2. **Task 6.2 — Project REST API Surface**:
   - Routes: `apps/backend/src/modules/projects/projects.routes.js` conforming to `docs/15.API-SPECIFICATION.md` Section 35:
     - `GET /api/v1/projects`: List projects with status, search, and ordering filters.
     - `POST /api/v1/projects`: Create project in workspace context.
     - `GET /api/v1/projects/:id`: Get single project with aggregated task metrics.
     - `PATCH /api/v1/projects/:id`: Update project details.
     - `DELETE /api/v1/projects/:id`: Soft-delete project (unlinking tasks via `ON DELETE SET NULL`).
     - `POST /api/v1/projects/:id/restore`: Restore soft-deleted project.
     - `GET / POST / DELETE /api/v1/projects/:id/members`: Project member access control.
   - Tests: Unit tests (`apps/backend/tests/projects.test.js`) and live PostgreSQL 16 tests (`apps/backend/tests/projects-live.test.js`).

3. **Task 6.3 & 6.4 — Board & Column Domain Foundation**:
   - Schema & Migrations: Created `boards` and `board_columns` tables with unique position constraints (`uq_board_columns_position UNIQUE(board_id, position)`), non-negative check constraints, and soft-delete support.
   - Automatic Column Provisioning: Creating a board automatically seeds deterministic default columns: To Do (`position: 0`, `TODO`), In Progress (`position: 1`, `IN_PROGRESS`), Done (`position: 2`, `COMPLETED`).
   - Reordering Engine: Offset-based two-phase reordering prevents intermediate unique constraint collisions during drag-and-drop or column movement.
   - Repositories & Services: `boards.repository.js`, `columns.repository.js`, `boards.service.js`.

4. **Task 6.5 — Task ↔ Project / Board Integration**:
   - Foreign Keys: `tasks.project_id`, `tasks.board_id`, `tasks.board_column_id` wired with `ON DELETE SET NULL` preventing task invalidation when projects/boards/columns are removed.
   - Task Moving & Status Transitions (`moveTaskToColumn`): Moving a task to a column automatically updates `board_column_id` and deterministically transitions status to column's `status_mapping` with appropriate `completed_at` timestamps.
   - Task Independence: Task descriptions, priorities, subtasks, dependencies, and standalone completion lifecycle remain strictly preserved.

5. **Task 6.6 — Board REST API Surface**:
   - Routes: `apps/backend/src/modules/boards/boards.routes.js` conforming to `docs/15.API-SPECIFICATION.md` Section 36:
     - `GET /api/v1/boards`: List workspace boards, optionally filtered by project.
     - `POST /api/v1/boards`: Create board (with auto-provisioned default columns).
     - `GET /api/v1/boards/:id`: Retrieve board with ordered columns.
     - `PATCH / DELETE / POST restore /api/v1/boards/:id`: Board lifecycle operations.
     - `GET /api/v1/boards/:id/tasks`: List tasks grouped/assigned to board.
     - `POST /api/v1/boards/:id/columns`: Create custom column.
     - `PATCH / DELETE /api/v1/boards/:id/columns/:columnId`: Update / delete column.
     - `PUT /api/v1/boards/:id/columns/reorder`: Deterministic column reordering.
     - `POST /api/v1/boards/:id/tasks/:taskId/move`: Move task between columns.

6. **Task 6.7 to 6.9 — Web UI & Kanban Interaction (`apps/web`)**:
   - Pages:
     - `ProjectsPage.jsx`: Project grid, search, status filters (Active, On Hold, Completed, Archived), progress bars (`completed / total tasks`), and creation modal.
     - `ProjectDetailPage.jsx`: Project header, progress gauge, edit/delete actions, and tabbed view (Tasks, Boards, Members).
     - `BoardsPage.jsx`: Board card overview, project filter, and board creation trigger.
     - `BoardDetailPage.jsx`: Full-screen Kanban cockpit, task quick-add, column reordering, task detail drawer integration, and empty board handling (`TM-BOARD-007`).
   - Kanban Components:
     - `KanbanBoard.jsx`: Horizontal scrollable board container with column reordering.
     - `KanbanColumn.jsx`: Column header, badge counter, drop target, quick-add task, move left/right controls.
     - `KanbanCard.jsx`: Dual interaction support: HTML5 drag-and-drop plus keyboard-accessible non-drag dropdown alternative (`Move column` per `UX-T09`).
     - Modals: `CreateProjectModal.jsx`, `CreateBoardModal.jsx`, `CreateColumnModal.jsx`.

7. **Task 6.10 — Playwright End-to-End Test Suite (`e2e/projects-boards.spec.js`)**:
   - Implemented 8 dedicated user journeys covering all Phase 6 test matrix requirements:
     - `TM-PROJECT-001` (E2E): User can create a project via UI modal.
     - `TM-PROJECT-002` (E2E): User can view and associate tasks with projects.
     - `TM-PROJECT-004` (E2E): Project deletion unlinks tasks without deleting them.
     - `TM-BOARD-001` (E2E): User can create a board with default columns.
     - `TM-BOARD-002` (E2E): User can create custom columns on a board.
     - `TM-BOARD-003 & TM-BOARD-004` (E2E): Task movement updates column and status.
     - `TM-BOARD-007` (E2E): Empty board displays dedicated empty state and add column trigger.
     - `TM-BOARD-008` (E2E): Large board with multiple columns and 30+ tasks remains performant.

8. **Task 6.11 to 6.13 — Live PostgreSQL Verification, Security Audit & Regression Check**:
   - Migrated on live PostgreSQL 16.15 with full UP/DOWN verification.
   - Cross-workspace tenant isolation and IDOR checks verified.
   - All Phase 5 task management functionality verified 100% intact.

---

## Phase 6 Final Verification Matrix

| Verification Check          | Scope / Command                    | Result     | Details                                         |
| --------------------------- | ---------------------------------- | ---------- | ----------------------------------------------- |
| **JavaScript-Only Guard**   | `npm run check:js-only`            | **PASSED** | 0 TypeScript files across whole repository      |
| **Linter Verification**     | `npm run lint`                     | **PASSED** | 0 errors, 0 warnings across all workspaces      |
| **Formatting Check**        | `npm run format:check`             | **PASSED** | 100% Prettier compliant                         |
| **Shared Unit Tests**       | `packages/shared/tests/*.test.js`  | **PASSED** | 22/22 tests passed (schemas + datetime)         |
| **Backend Test Suite**      | `apps/backend/tests/*.test.js`     | **PASSED** | 272/272 tests passed across 22 test files       |
| **Web Test Suite**          | `apps/web/tests/*.test.jsx`        | **PASSED** | 39/39 tests passed across 5 test files          |
| **Desktop Tests**           | `apps/desktop/tests/*.test.js`     | **PASSED** | 3/3 tests passed (security + IPC whitelist)     |
| **Mobile Tests**            | `apps/mobile/tests/*.test.js`      | **PASSED** | 6/6 tests passed (tabs + env + API client)      |
| **Monorepo Unit/Int Tests** | `npm test`                         | **PASSED** | **342/342 tests passed** across 30 test files   |
| **Playwright E2E Tests**    | `npm run test:e2e`                 | **PASSED** | **15/15 tests passed** in real Chromium browser |
| **Web Production Build**    | `npm run build -w @workaholic/web` | **PASSED** | Production bundle generated with 0 errors       |
| **Live PG 16 Migration**    | `migrate:up` / `migrate:down`      | **PASSED** | Verified UP, DOWN, UP on PostgreSQL 16.15       |

---

## Phase 6 Summary

- **Phase 6 Classification**: **VERIFIED COMPLETE**
- **Strict Invariants Preserved**: Pure JavaScript/JSX only, zero ORMs, parameterized PostgreSQL queries, zero microservices / Redis / Kafka.
- **Scope Containment**: Phase 7 and later features (Calendar, Recurrence, Reminders, Google Drive, Notes, Collaboration, Offline Sync) strictly deferred; clean nullable extension points preserved.

---

## Phase 7: Core Web UX

### Overview & Objectives

Phase 7 unifies and refines the web client user experience across all implemented domains (Tasks, Projects, Boards, Today) according to `docs/phase-wise-plan.md` Section 11, `docs/13.UX-SPECIFICATION.md`, and `docs/14.DESIGN-SYSTEM.md`. This phase establishes shared, accessible UI primitives, an authoritative application shell with responsive navigation, modal dialog focus management, and unified loading, empty, and error states while preserving 100% of Phase 5 and Phase 6 business logic.

### Completed Tasks

1. **Design Tokens & Motion Utilities (`apps/web/src/index.css`)**:
   - Integrated standardized design tokens for spacing, elevation shadows (`--shadow-sm` through `--shadow-2xl`), accessible touch targets (minimum 44px), and smooth micro-animations (`modalEnter`, `drawerSlideIn`, `toastIn`).
   - Implemented strict `@media (prefers-reduced-motion: reduce)` rules that automatically zero out transitions and animations (`0.01ms`), satisfying `UX-T06`, `UX-T30`, and `TM-A11Y-007`.

2. **Standardized Reusable UI Primitives (`apps/web/src/components/common/`)**:
   - `Modal.jsx`: Authoritative modal dialog primitive enforcing WAI-ARIA modal dialog patterns (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`). Features window-level Escape listener, focus trapping with cycle wrap, and focus restoration to opener element upon dismiss (`TM-A11Y-004`, `UX-T03`).
   - `ConfirmDialog.jsx`: Standardized accessible destructive confirmation dialog replacing ad-hoc modals with consequence explanations and confirm/cancel action controls.
   - `Button.jsx`: Universal button primitive supporting design system variants (`primary`, `secondary`, `danger`, `ghost`), sizes (`sm`, `md`, `lg`), `React.forwardRef` support, and accessible busy spinner state (`aria-busy="true"`).
   - `Badge.jsx`: Accessible categorization and status badge meeting WCAG 2.1 AA color contrast standards (`UX-T05`).
   - `EmptyState.jsx`: Standardized empty state primitive with `role="status"`, icon, title, description, and primary action trigger.
   - `ErrorBanner.jsx`: Standardized error alert banner with `role="alert"`, descriptive message, and retry/dismiss callbacks.
   - `PageHeader.jsx`: Unified page header providing title, description, status badge, and action container across all pages.
   - `ToastContext.jsx`: Accessible notification system (`role="status"`, `aria-live="polite"`) providing polite transient alerts with auto-dismiss and dismiss buttons (`UX-T11`).

3. **Canonical Application Shell & Responsive Navigation (`apps/web/src/components/layout/`)**:
   - `TopBar.jsx`: Canonical application top bar with responsive location breadcrumb, workspace badge ("Personal"), and Global Quick Task capture trigger.
   - `AppLayout.jsx`: Application shell with accessible skip link (`a.skip-link` -> `main#main-content` with `tabIndex={-1}` per `UX-T02`), responsive off-canvas mobile drawer with backdrop overlay (<768px viewport per `UX-T28`), ErrorBoundary wrapping, and integrated `ToastProvider`.
   - Global Quick Task Capture: Quick Task modal opens from TopBar and broadcasts task creation across views via custom DOM event `workaholic:task-created`.

4. **Task, Project & Board View Unification**:
   - Upgraded `TasksPage.jsx`, `ProjectsPage.jsx`, `ProjectDetailPage.jsx`, `BoardsPage.jsx`, `BoardDetailPage.jsx`, and `TodayPage.jsx` to adopt `PageHeader`, `EmptyState`, `ErrorBanner`, `Button`, `Badge`, and `ToastContext`.
   - Upgraded modal dialogs (`CreateTaskModal.jsx`, `CreateProjectModal.jsx`, `CreateBoardModal.jsx`, `CreateColumnModal.jsx`, `TaskDetailDrawer.jsx`) to wrap `Modal` and standardized primitives.
   - Verified zero regressions on Phase 5 task workflows and Phase 6 project/board/Kanban workflows.

5. **Automated Testing & Full Verification**:
   - **Component Unit Suite (`apps/web/tests/core-ux.test.jsx`)**: 11 unit/component integration tests verifying Modal focus trap, escape key, focus restoration, ConfirmDialog, ToastContext, EmptyState, ErrorBanner, Button, Badge, and TopBar.
   - **Playwright E2E Suite (`e2e/core-ux.spec.js`)**: 5 end-to-end tests verifying keyboard Tab order & skip link (`UX-T01`, `UX-T02`), modal focus trapping, escape dismiss & restoration (`UX-T03`, `TM-A11Y-004`), TopBar Quick Task creation with polite toast (`UX-T11`), responsive mobile drawer navigation toggle (`UX-T28`), and reduced-motion compliance (`UX-T06`, `UX-T30`, `TM-A11Y-007`).
   - **Full Playwright Suite (`npm run test:e2e`)**: All 20 tests pass across `core-ux.spec.js`, `tasks.spec.js`, and `projects-boards.spec.js`.

---

## Phase 7 Final Verification Matrix

| Verification Check          | Scope / Command                    | Result     | Details                                            |
| --------------------------- | ---------------------------------- | ---------- | -------------------------------------------------- |
| **JavaScript-Only Guard**   | `npm run check:js-only`            | **PASSED** | 0 TypeScript files across whole repository         |
| **Linter Verification**     | `npm run lint`                     | **PASSED** | 0 errors, 0 warnings across all workspaces         |
| **Formatting Check**        | `npm run format:check`             | **PASSED** | 100% Prettier compliant                            |
| **Shared Unit Tests**       | `packages/shared/tests/*.test.js`  | **PASSED** | 22/22 tests passed (schemas + datetime)            |
| **Backend Test Suite**      | `apps/backend/tests/*.test.js`     | **PASSED** | 272/272 tests passed across 22 test files          |
| **Web Test Suite**          | `apps/web/tests/*.test.jsx`        | **PASSED** | 50/50 tests passed across 6 test files             |
| **Desktop Tests**           | `apps/desktop/tests/*.test.js`     | **PASSED** | 3/3 tests passed (security + IPC whitelist)        |
| **Mobile Tests**            | `apps/mobile/tests/*.test.js`      | **PASSED** | 6/6 tests passed (tabs + env + API client)         |
| **Monorepo Unit/Int Tests** | `npm test`                         | **PASSED** | **353/353 tests passed** across 31 test files      |
| **Playwright E2E Tests**    | `npx playwright test`              | **PASSED** | **21/21 tests passed** across all 3 E2E test specs |
| **Web Production Build**    | `npm run build -w @workaholic/web` | **PASSED** | Production bundle generated cleanly in 1.56s       |

---

## Phase 7 Summary

- **Phase 7 Classification**: **VERIFIED COMPLETE**
- **Strict Invariants Preserved**: Pure JavaScript/JSX only, zero ORMs, PostgreSQL authoritative, React 18.2.0 baseline.
- **Accessibility Compliance**: Fully keyboard navigatable (`UX-T01`), skip link jumps to main content (`UX-T02`), modal focus trapping and restoration (`UX-T03`), WCAG 2.1 AA contrast ratios (`UX-T05`), reduced motion support (`UX-T06`), mobile off-canvas drawer (<768px `UX-T28`).
- **Scope Containment**: Phase 8: Calendar and all subsequent phases (Recurrence, Reminders, Google Drive, Notes, Booking, Collaboration) strictly deferred. Clean navigation links exist without fake or premature domain implementations.
- **Next Authorized Phase**: Phase 8: Calendar (Completed).

---

## Phase 8: Calendar

### Overview & Objectives

Phase 8 implements the native Calendar operating domain of Workaholic according to `docs/9.CALENDAR-SPECIFICATION.md`, `docs/7.DATABASE-DESIGN.md`, `docs/4.buisness-rules.md`, `docs/15.API-SPECIFICATION.md`, and `docs/17.TEST-MATRIX.md`. This phase establishes native multi-calendar management, whole-date all-day event semantics reconciled against `TIMESTAMPTZ` persistence, time-zoned event intervals, informational scheduling conflict detection, unified range querying (merging events, task work blocks, and task deadlines), Day/Week/Workweek/Month/Agenda interactive views, and accessible creation/editing/cancellation modals while maintaining strict architectural isolation and extension points for future recurrence (Phase 10), Google Calendar synchronization (Phase 13), and academic Day Order scheduling (Phase 18).

### Reconciled All-Day Event Semantics

1. **Date-Based Whole Day Invariant**: All-day events represent whole calendar dates (`YYYY-MM-DD`) rather than clock intervals. They are stored in PostgreSQL as UTC normalized boundaries (`00:00:00.000Z` to `23:59:59.999Z`) with `is_all_day = true`, and exposed across domain/API/UI layers with explicit `startDate` and `endDate` fields.
2. **Timezone Crossing Invariant**: All-day events render in dedicated All-Day Header rows above hourly time grids, guaranteeing that an all-day event on `2026-09-15` never shifts across date boundaries when viewed in any client timezone.
3. **Range Queries**: SQL range queries include all-day events using inclusive date-boundary overlap: `(e.start_at <= $rangeEnd AND e.end_at >= $rangeStart)`.

### Completed Tasks

1. **Shared Constants, Utilities & Schemas (`packages/shared`)**:
   - Constants: `CALENDAR_SOURCE` (`WORKAHOLIC`, `GOOGLE`, `COLLEGE`, `DAY_ORDER`, `HOLIDAY`, `BIRTHDAY`, `BOOKING`, `IMPORTED`), `CALENDAR_VISIBILITY` (`PRIVATE`, `SHARED`, `PUBLIC`), `EVENT_VISIBILITY` (`PRIVATE`, `SHARED`, `PUBLIC`), `EVENT_STATUS` (`CONFIRMED`, `TENTATIVE`, `CANCELLED`), `CALENDAR_VIEW` (`DAY`, `WEEK`, `WORKWEEK`, `MONTH`, `AGENDA`).
   - Pure JavaScript date utilities (`packages/shared/src/utils/datetime.js`): `normalizeAllDayBounds`, `extractAllDayDates`, `deriveAllDayDates`.
   - Zod validation schemas (`packages/shared/src/schemas/index.js`): `createCalendarSchema`, `updateCalendarSchema`, `calendarQuerySchema`, `createEventSchema`, `updateEventSchema`, `calendarRangeQuerySchema` with `.superRefine` cross-field date validations.
   - Unit tests (`packages/shared/tests/schemas.test.js`): 100% pass across all schemas and utilities.

2. **PostgreSQL 16 Migration (`apps/backend/migrations/1725628806000_create_calendar_tables.sql`)**:
   - `calendars`: Primary multi-calendar model with tenant workspace FK, visibility (`PRIVATE`, `SHARED`, `PUBLIC`), color, source_type (`WORKAHOLIC` default), default flag (`is_default`), and tenant isolation indexes.
   - `events`: Core event table with `TIMESTAMPTZ` intervals, `is_all_day`, `timezone`, `location`, `meeting_url`, `visibility` (`PRIVATE`, `SHARED`, `PUBLIC`), `status` (`CONFIRMED`, `TENTATIVE`, `CANCELLED`), `source_type` (`WORKAHOLIC` default), `source_reference`, `recurrence_rule_id` extension point, and check constraint `chk_events_time_validity`.
   - `event_tasks` & `event_projects`: Many-to-many relationship tables with `ON DELETE CASCADE`.
   - `task_work_blocks.calendar_id`: Foreign key constraint linking task work blocks to calendars.
   - Live migration up/down verified on PostgreSQL 16 container.

3. **Backend Repositories, Domain Service & API Routes (`apps/backend`)**:
   - `calendars.repository.js` & `events.repository.js`: Parameterized SQL repositories supporting optional client for ACID transactions and row mappers.
   - `calendar.service.js`: Domain service coordinating event creation, conflict detection warnings, tenant isolation, range queries with task work blocks and deadlines integration.
   - `calendar.routes.js`: Fastify plugin registering `/api/v1/calendar/calendars`, `/api/v1/calendar/events`, and `/api/v1/calendars/:calendarId/events`.
   - Testing: `calendar.test.js` (domain logic) and `calendar-live.test.js` (PostgreSQL live integration) covering `TM-CAL-001` through `TM-CAL-013`.

4. **Web Client Calendar (`apps/web`)**:
   - `calendar.api.js`: Standardized client service for calendars and events.
   - `calendar.js`: Client-side date and month matrix calculation utilities.
   - Accessible Components: `CalendarHeader.jsx`, `CalendarFilterPanel.jsx`, `MonthView.jsx`, `WeekView.jsx`, `DayView.jsx`, `AgendaView.jsx`, `CreateEventModal.jsx`, `EventDetailModal.jsx`, `CreateCalendarModal.jsx`.
   - `CalendarPage.jsx`: Mounted at `/calendar` inside `AppLayout`, managing active date, view modes, calendar visibility toggles, and unified work item feeds.
   - Unit tests: `apps/web/tests/calendar.test.jsx` (10 tests) verifying all calendar views and modals.

5. **Playwright End-to-End Suite (`e2e/calendar.spec.js`)**:
   - 7 E2E tests validating the complete user journey:
     - `TM-CAL-001` (E2E): User can create a timed calendar event via modal.
     - `TM-CAL-003` (E2E): All-day events render in dedicated all-day row and accept date inputs.
     - `TM-CAL-005` through `TM-CAL-008` (E2E): Seamless navigation across Month, Week, Workweek, Day, and Agenda views.
     - `TM-CAL-009` (E2E): User can open event detail and edit an event.
     - `TM-CAL-010` (E2E): User can delete an event with confirmation.
     - `TM-CAL-012` (E2E): Private events display properly and maintain privacy markings.
     - `TM-CAL-013` (E2E): Calendar filtering hides and reveals events dynamically.
   - Full Playwright suite: 28/28 tests passing across `calendar.spec.js`, `core-ux.spec.js`, `projects-boards.spec.js`, and `tasks.spec.js`.

---

## Phase 8 Final Verification Matrix

| Verification Check          | Scope / Command                    | Result     | Details                                            |
| --------------------------- | ---------------------------------- | ---------- | -------------------------------------------------- |
| **JavaScript-Only Guard**   | `npm run check:js-only`            | **PASSED** | 0 TypeScript files across whole repository         |
| **Linter Verification**     | `npm run lint`                     | **PASSED** | 0 errors, 0 warnings across all workspaces         |
| **Formatting Check**        | `npm run format:check`             | **PASSED** | 100% Prettier compliant                            |
| **Shared Unit Tests**       | `packages/shared/tests/*.test.js`  | **PASSED** | 27/27 tests passed (schemas + datetime)            |
| **Backend Test Suite**      | `apps/backend/tests/*.test.js`     | **PASSED** | 286/286 tests passed across 23 test files          |
| **Web Test Suite**          | `apps/web/tests/*.test.jsx`        | **PASSED** | 60/60 tests passed across 7 test files             |
| **Desktop Tests**           | `apps/desktop/tests/*.test.js`     | **PASSED** | 3/3 tests passed (security + IPC whitelist)        |
| **Mobile Tests**            | `apps/mobile/tests/*.test.js`      | **PASSED** | 6/6 tests passed (tabs + env + API client)         |
| **Monorepo Unit/Int Tests** | `npm test`                         | **PASSED** | **382/382 tests passed** across 34 test files      |
| **Playwright E2E Tests**    | `npx playwright test`              | **PASSED** | **28/28 tests passed** across all 4 E2E test specs |
| **Web Production Build**    | `npm run build -w @workaholic/web` | **PASSED** | Production bundle generated cleanly in 1.72s       |

---

## Phase 8 Summary

- **Phase 8 Classification**: **VERIFIED COMPLETE**
- **Authoritative Specifications Satisfied**: `CALENDAR-SPECIFICATION.md`, `DATABASE-DESIGN.md`, `buisness-rules.md`, `API-SPECIFICATION.md`, `TEST-MATRIX.md` (TM-CAL-001 through TM-CAL-013).
- **All-Day Event Semantics**: Reconciled and verified without clock-time distortion or timezone crossing bugs.
- **Strict Invariants Preserved**: Zero TypeScript, zero ORMs, pure `pg` parameterized queries with ACID transactions, PostgreSQL 16 authoritative.
- **Scope Containment**: Recurrence (Phase 10), Google Calendar Sync (Phase 13), Academic Day Order (Phase 18), Booking (Phase 20), and Today Cockpit (Phase 9) strictly deferred.
- **Next Authorized Phase**: Phase 9: Today Command Center (Completed).

---

## Phase 9: Today / Command Center

### Overview & Objectives

Phase 9 implements the unified Today Command Center daily cockpit according to `docs/2.requirements.md` (REQ-TODAY-001..008), `docs/13.UX-SPECIFICATION.md` (Sections 6 & 7), `docs/4.buisness-rules.md` (BR-TASK-007, BR-SCHED-001..005), `docs/9.CALENDAR-SPECIFICATION.md` (Section 18), `docs/15.API-SPECIFICATION.md` (Section 41.1), and `docs/17.TEST-MATRIX.md` (TM-TODAY-001..006). This phase consolidates scheduled task work blocks, calendar events, deadlines, overdue work, and active priorities into a single contextual read model without creating unnecessary database tables or fake productivity metrics.

### Reconciled Phase 9 Semantics

1. **Today Calendar Date & Timezone Precedence**: Today is evaluated as a calendar date within the user's effective timezone (`request.query.timezone` → authenticated user's timezone → `UTC`). Day boundaries are computed authoritatively in PostgreSQL via `AT TIME ZONE` (e.g. `2026-09-07 Asia/Kolkata` maps to `2026-09-06 18:30:00 UTC` through `2026-09-07 18:29:59.999 UTC`).
2. **Overdue vs Due Today**: Overdue is strictly `due_at < NOW()` for incomplete tasks (BR-TASK-007). Due today requires `day_start_utc <= due_at <= day_end_utc`. Tasks due earlier today qualify as overdue and display in Due Today with an Overdue badge.
3. **Important Work**: Active, incomplete tasks with priority `P0`, `P1`, or `P2`.
4. **Current Work (Now Cockpit)**: Scheduled work whose interval currently contains NOW (`start_at <= now < end_at`). Task work blocks take precedence over overlapping events. If nothing is active, evaluates to `null` with honest UI standby message (no arbitrary task fallback).
5. **Next Work**: The first scheduled item starting strictly after NOW (`start_at > now`) within today's local day, ordered `start_at ASC`. Evaluates to `null` if nothing remains scheduled today.
6. **Unscheduled Work**: Active incomplete tasks that are either high priority (`P0`/`P1`/`P2`) or due within today's window and have no active work block. Allows scheduling a block via direct UI action.

### Completed Tasks

1. **Shared Query Validation Schema (`packages/shared`)**:
   - `todayQuerySchema`: Validates optional `date` (`YYYY-MM-DD`) and optional IANA `timezone`.
   - Unit tests: `packages/shared/tests/schemas.test.js` passing (29/29 tests).

2. **Backend Today Read-Model Module (`apps/backend`)**:
   - `today.service.js`: Assembles unified daily read model with timezone-aware PostgreSQL queries, concurrent aggregations, and strict workspace tenant scoping.
   - `today.routes.js`: Exposes `GET /api/v1/today` protected with `requireAuth` and `requireWorkspaceAccess()`.
   - Backend unit tests (`apps/backend/tests/today.test.js`): 8 tests covering timezone boundary conversion, temporal ordering cases 1–5, and overdue tasks due earlier today.
   - Backend live database tests (`apps/backend/tests/today-live.test.js`): 8 tests verifying TM-TODAY-001..006, cross-tenant isolation, Asia/Kolkata day boundaries, and work block anti-joins against live PostgreSQL 16.

3. **Web Client Today Command Center (`apps/web`)**:
   - `today.api.js`: Standardized API service fetching Today cockpit data.
   - `ScheduleWorkBlockModal.jsx`: Modal allowing direct scheduling of work blocks for unscheduled tasks.
   - `TodayPage.jsx`: Rebuilt command center featuring:
     - Header with live date/time, timezone indicator, Quick Task trigger, New Event trigger, and Refresh button.
     - **Now & Next Cockpit**: Active now / Next up cards with honest standby states when null.
     - **Left Column (Tasks Cockpit)**: Overdue tasks alert section, Due Today list with overdue indicators, Important Work (P0/P1/P2) section, and Completed Today section with complete/reopen toggle (TM-TASK-011).
     - **Right Column (Today's Schedule)**: All-day events banner and combined chronological timeline of timed calendar events and task work blocks.
     - **Bottom Section (Unscheduled Important Work)**: Actionable high-priority tasks lacking work blocks, with "Schedule Block" modal trigger.
   - Web component tests (`apps/web/tests/today.test.jsx`): 8 unit/component tests passing.

4. **Playwright End-to-End Suite (`e2e/today.spec.js`)**:
   - 8 E2E tests validating the full browser journey:
     - `TM-TODAY-001` (E2E): Today's tasks displayed in Due Today section.
     - `TM-TODAY-002` (E2E): Overdue tasks displayed with alert badge in Overdue section.
     - `TM-TODAY-003` (E2E): Important tasks (P0/P1/P2) displayed under Important Work.
     - `TM-TODAY-004` (E2E): Today's calendar events and all-day events displayed in Schedule timeline.
     - `TM-TODAY-005` (E2E): Unscheduled work discoverable and actionable via Schedule Block modal.
     - `TM-TODAY-006` (E2E): Current and Next work displayed in Now & Next cockpit in correct chronological order.
     - `TM-TODAY-006` (E2E Standby): Honest standby states when no current/next work scheduled.
     - `TM-TASK-011` (E2E): Complete and reopen task directly in Today view.
   - Full Playwright suite: 36/36 tests passing across all 5 test specs.

---

## Phase 9 Final Verification Matrix

| Verification Check          | Scope / Command                    | Result     | Details                                            |
| --------------------------- | ---------------------------------- | ---------- | -------------------------------------------------- |
| **JavaScript-Only Guard**   | `npm run check:js-only`            | **PASSED** | 0 TypeScript files across whole repository         |
| **Linter Verification**     | `npm run lint`                     | **PASSED** | 0 errors, 0 warnings across all workspaces         |
| **Formatting Check**        | `npm run format:check`             | **PASSED** | 100% Prettier compliant                            |
| **Shared Unit Tests**       | `packages/shared/tests/*.test.js`  | **PASSED** | 29/29 tests passed (schemas + datetime)            |
| **Backend Test Suite**      | `apps/backend/tests/*.test.js`     | **PASSED** | 302/302 tests passed across 25 test files          |
| **Web Test Suite**          | `apps/web/tests/*.test.jsx`        | **PASSED** | 68/68 tests passed across 7 test files             |
| **Desktop Tests**           | `apps/desktop/tests/*.test.js`     | **PASSED** | 3/3 tests passed (security + IPC whitelist)        |
| **Mobile Tests**            | `apps/mobile/tests/*.test.js`      | **PASSED** | 6/6 tests passed (tabs + env + API client)         |
| **Monorepo Unit/Int Tests** | `npm test`                         | **PASSED** | **403/403 tests passed** across 36 test files      |
| **Playwright E2E Tests**    | `npx playwright test`              | **PASSED** | **36/36 tests passed** across all 5 E2E test specs |
| **Web Production Build**    | `npm run build -w @workaholic/web` | **PASSED** | Production bundle generated cleanly in 2.42s       |

---

## Phase 9 Summary

- **Phase 9 Classification**: **VERIFIED COMPLETE**
- **Authoritative Specifications Satisfied**: `2.requirements.md` (REQ-TODAY-001..008), `13.UX-SPECIFICATION.md` (Sections 6 & 7), `4.buisness-rules.md` (BR-TASK-007, BR-SCHED-001..005), `9.CALENDAR-SPECIFICATION.md` (Section 18), `15.API-SPECIFICATION.md` (Section 41.1), `17.TEST-MATRIX.md` (TM-TODAY-001..006).
- **Strict Invariants Preserved**: Zero TypeScript, zero ORMs, pure `pg` parameterized queries, PostgreSQL 16 authoritative, zero fake productivity metrics or AI/NLP scheduling.
- **Scope Containment**: Recurrence (Phase 10), Reminders (Phase 11), Google Calendar Sync (Phase 13), and Academic Day Order (Phase 18) strictly deferred.
- **Next Authorized Phase**: Phase 10: Recurrence (Completed).

---

## Phase 10: Recurrence — COMPLETED & VERIFIED

### Overview & Objectives

Phase 10 implements the unified, range-bounded Recurrence Engine and occurrence management for recurring calendar events and recurring tasks in Workaholic according to `docs/1.DOMAIN-MODEL.md` (Section 13), `docs/9.CALENDAR-SPECIFICATION.md` (Section 7), `docs/7.DATABASE-DESIGN.md` (Section 10), `docs/4.buisness-rules.md` (BR-SCHED-004), `docs/15.API-SPECIFICATION.md` (Sections 14 & 18), and `docs/17.TEST-MATRIX.md` (TM-REC-001..013). This phase provides pure JavaScript RFC 5545 recurrence rule expansion, dynamic projection without infinite database row pre-generation, full exception overlay (`CANCELLED`, `MODIFIED`, `RESCHEDULED`, `COMPLETED`), edit scopes (`THIS`, `THIS_AND_FOLLOWING`, `SERIES`), wall-clock timezone / DST shift safety, and recurring task occurrence completion semantics.

### Reconciled Phase 10 Semantics

1. **Range-Bounded Dynamic Expansion**: Neither infinite rows nor arbitrary batches are pre-generated in the database. Occurrences are dynamically generated from `recurrence_rules` for the query's `[rangeStart, rangeEnd]` window and combined with non-recurring records and exception overlays.
2. **Occurrence Identity & Exception Tracking**:
   - For all-day events: `occurrenceKey` is the unshifted master local date `YYYY-MM-DD`.
   - For timed events: `occurrenceKey` is the unshifted original UTC timestamp (e.g. `2026-09-08T09:00:00.000Z`).
   - Exceptions are stored in `recurrence_exceptions` keyed by `(recurrence_rule_id, occurrence_key)`.
3. **Edit Scopes**:
   - `THIS`: Modifies or cancels a single occurrence by recording an exception row without splitting or altering the parent series.
   - `THIS_AND_FOLLOWING`: Executes an atomic series split using `withTransaction` in PostgreSQL. Binds the existing series `end_at` to the previous occurrence, creates a new independent recurrence rule from the split point forward, updates the master event or task, and preserves past history intact.
   - `SERIES`: Modifies the recurrence rule or master event / task properties directly for all future and past unexceptional occurrences.
4. **Timezone & DST Wall-Clock Safety**: Recurrence expansion calculates local calendar time components (`year`, `month`, `date`, `hours`, `minutes`) and projects them back into UTC for the target date, ensuring meetings scheduled at 09:00 local time stay at 09:00 local time across DST spring-forward, DST fall-back, and non-DST timezones (Asia/Kolkata, America/New_York, Europe/London).
5. **Task Recurrence Semantics**: Completing a recurring task occurrence records a `COMPLETED` exception in `recurrence_exceptions` and advances the task's `due_at` to the next uncompleted occurrence while keeping the task `status` as `TODO`. When a bounded series reaches its end condition (count or until date), the task status transitions to `COMPLETED`. Reopening an occurrence rolls back the `due_at` and deletes the exception.

### Completed Tasks

1. **Task 10.1 — Shared Recurrence Constants and Schemas (`packages/shared`)**:
   - `RECURRENCE_FREQUENCY` (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), `RECURRENCE_EDIT_MODE` (`THIS`, `THIS_AND_FOLLOWING`, `SERIES`), `RECURRENCE_EXCEPTION_TYPE` (`CANCELLED`, `MODIFIED`, `RESCHEDULED`, `COMPLETED`), `WEEKDAY` (0=SU .. 6=SA).
   - `recurrenceRuleSchema`, `editOccurrenceSchema`, and updated `createTaskSchema`, `updateTaskSchema`, `createEventSchema`, `updateEventSchema`.
   - Verified with 34/34 tests passing in `packages/shared/tests/schemas.test.js`.

2. **Task 10.2 — Database Migration (`apps/backend/migrations`)**:
   - Created and applied `1725628807000_create_recurrence_tables.sql`.
   - Created `recurrence_rules` table with frequency, interval, by_weekday, by_month_day, by_set_pos, start_at, end_at, occurrence_count, timezone, rrule_string.
   - Created `recurrence_exceptions` table with `UNIQUE(recurrence_rule_id, occurrence_key)` and composite foreign key cascade.
   - Added foreign key columns `recurrence_rule_id` to `events` and `tasks` tables with index support.

3. **Task 10.3 — Pure JS Recurrence Engine (`apps/backend/src/modules/recurrence`)**:
   - Implemented `recurrence.engine.js`: `expandOccurrences`, `formatRRuleString`, `localToUtc`, `getLocalComponents`, `isOccurrenceOfSeries`.
   - Implemented `apps/backend/tests/recurrence.engine.test.js` covering TM-REC-001 through TM-REC-012, plus Edge Cases A–E (Asia/Kolkata, America/New_York DST transitions, London DST transitions, all-day events, leap years). 24/24 tests passing.

4. **Task 10.4 — Recurrence Repositories & Service (`apps/backend/src/modules/recurrence`)**:
   - `recurrence.repository.js`: Parameterized SQL queries for rule CRUD and exception management.
   - `recurrence.service.js`: Rule lifecycle, exception overlay mapping, and atomic `splitSeries` transactions.

5. **Task 10.5 & 10.6 — Calendar Recurrence Integration & APIs (`apps/backend/src/modules/calendar`)**:
   - Updated `events.repository.js` to dynamically expand occurrences within range queries and overlay exceptions.
   - Updated `calendar.service.js` with `editOccurrence` (`THIS`, `THIS_AND_FOLLOWING`, `SERIES`) and `cancelOccurrence`.
   - Added routes `PATCH /events/:id/occurrences/:occurrenceKey` and `DELETE /events/:id/occurrences/:occurrenceKey`.
   - Live integration tests: `apps/backend/tests/calendar-recurrence-live.test.js` (5/5 passing against live PostgreSQL 16).

6. **Task 10.7 & 10.8 — Task Recurrence Integration, Completion & Reopening (`apps/backend/src/modules/tasks`)**:
   - Updated `tasks.repository.js` to map `recurrence_rule_id`.
   - Updated `tasks.service.js` with `completeOccurrence` and `reopenOccurrence`.
   - Added routes `POST /tasks/:id/occurrences/:occurrenceKey/complete` and `POST /tasks/:id/occurrences/:occurrenceKey/reopen`.
   - Live integration tests: `apps/backend/tests/tasks-recurrence-live.test.js` (5/5 passing against live PostgreSQL 16).

7. **Task 10.9 & 10.10 — Web Client Recurrence UI & Today Integration (`apps/web`)**:
   - `calendar.api.js` & `tasks.api.js`: Client API methods for occurrence edit, cancel, complete, and reopen.
   - `CreateEventModal.jsx`: Recurrence configuration selector (Daily, Weekdays, Weekly, Monthly, Yearly, Custom with interval/weekday buttons, Ends: Never, On date, After count) and Edit Scope selector (`THIS`, `THIS_AND_FOLLOWING`, `SERIES`).
   - `EventDetailModal.jsx`: "🔄 Recurring" badge and occurrence deletion options ("Delete Occurrence" vs "Delete Series").
   - `CalendarPage.jsx`: Integrated occurrence editing and cancellation handlers.
   - `CreateTaskModal.jsx` & `TaskItem.jsx`: Recurring task creation and "🔄 Recurring" badge display.
   - `TasksPage.jsx`: Recurring task completion advancement to next recurrence.

8. **Task 10.11 — Playwright End-to-End Suite (`e2e/recurrence.spec.js`)**:
   - 3 E2E test journeys covering creating recurring events, inspecting badges, editing single occurrences, cancelling single occurrences vs series, and creating recurring tasks.
   - Full Playwright E2E suite: 39/39 tests passing across all 6 test specs (Calendar, Core UX, Projects/Boards, Recurrence, Tasks, Today).

---

## Phase 10 Final Verification Matrix

| Verification Check          | Scope / Command                    | Result     | Details                                            |
| --------------------------- | ---------------------------------- | ---------- | -------------------------------------------------- |
| **JavaScript-Only Guard**   | `npm run check:js-only`            | **PASSED** | 0 TypeScript files across whole repository         |
| **Linter Verification**     | `npm run lint`                     | **PASSED** | 0 errors, 0 warnings across all workspaces         |
| **Formatting Check**        | `npm run format:check`             | **PASSED** | 100% Prettier compliant                            |
| **Shared Unit Tests**       | `packages/shared/tests/*.test.js`  | **PASSED** | 34/34 tests passed (schemas + datetime)            |
| **Backend Test Suite**      | `apps/backend/tests/*.test.js`     | **PASSED** | 336/336 tests passed across 28 test files          |
| **Web Test Suite**          | `apps/web/tests/*.test.jsx`        | **PASSED** | 68/68 tests passed across 7 test files             |
| **Desktop Tests**           | `apps/desktop/tests/*.test.js`     | **PASSED** | 3/3 tests passed (security + IPC whitelist)        |
| **Mobile Tests**            | `apps/mobile/tests/*.test.js`      | **PASSED** | 6/6 tests passed (tabs + env + API client)         |
| **Monorepo Unit/Int Tests** | `npm test`                         | **PASSED** | **442/442 tests passed** across 39 test files      |
| **Playwright E2E Tests**    | `npx playwright test`              | **PASSED** | **39/39 tests passed** across all 6 E2E test specs |
| **Web Production Build**    | `npm run build -w @workaholic/web` | **PASSED** | Production bundle generated cleanly in 9.01s       |

---

## Phase 10 Summary

- **Phase 10 Classification**: **VERIFIED COMPLETE**
- **Authoritative Specifications Satisfied**: `1.DOMAIN-MODEL.md` (Section 13), `9.CALENDAR-SPECIFICATION.md` (Section 7), `7.DATABASE-DESIGN.md` (Section 10), `4.buisness-rules.md` (BR-SCHED-004), `15.API-SPECIFICATION.md` (Sections 14 & 18), `17.TEST-MATRIX.md` (TM-REC-001..013).
- **Strict Invariants Preserved**: Zero TypeScript, zero ORMs, pure `pg` parameterized queries with explicit ACID transactions, PostgreSQL 16 authoritative, zero premature background worker or Redis queues.
- **Scope Containment**: Phase 11 (Notifications & Reminders), Phase 12 (Background Job Infrastructure), Phase 13 (Google Calendar Sync), and Phase 18 (Academic Day Order) strictly deferred.
- **Next Authorized Phase**: Phase 10.13 (Occurrence-State Remediation).

---

## Phase 10.13: Recurring Task Occurrence-State Remediation — COMPLETED & VERIFIED

### Overview & Objectives

Following an independent architectural audit of Phase 10 Recurrence, Phase 10.13 remediates three critical defects in recurring-task occurrence completion while strictly preserving the verified Calendar recurrence engine:

1. **Historical Due Date Preservation (BR-TASK-008)**: Replaces the mutating `tasks.due_at` cursor with a dedicated, sparse persistence model via the `task_occurrences` table. `tasks.due_at` remains the immutable series anchor.
2. **Elimination of Out-of-Order Orphaning**: Forward-only search eliminated. Out-of-order completions record individual occurrence state without affecting uncompleted earlier occurrences.
3. **Strict Bounded Recurrence Accounting**: Corrects premature series completion for `COUNT=N` (requiring $\text{COMPLETED} + \text{CANCELLED} = N$) and `UNTIL` boundaries.

### Remediated Architecture

1. **Database Schema (`task_occurrences`)**:
   - Migration `1725628808000_create_task_occurrences.sql`.
   - Sparse table: absence of row = default implicit `TODO`.
   - Explicit rows: `status IN ('TODO', 'COMPLETED', 'CANCELLED')`.
   - Timed vs All-Day: `original_due_at`/`override_due_at` (`TIMESTAMPTZ`) vs `original_due_date`/`override_due_date` (`DATE`). Zero arbitrary UTC midnight distortion.
   - Canonical `occurrence_key` is immutable and preserved across rescheduling.
2. **Repository Layer (`task_occurrences.repository.js`)**:
   - `upsertTaskOccurrence`, `findTaskOccurrence`, `deleteTaskOccurrence`, `findOccurrencesByTaskId`, `findOccurrencesByTaskIds`, `findCompletedOccurrencesByRange`, and `countAccountedOccurrencesForTask`.
3. **Tasks Service & Routes Integration (`tasks.service.js`, `tasks.routes.js`)**:
   - `completeOccurrence`: sparse `task_occurrences` upsert, preserves `tasks.due_at`, preserves reschedule overrides, checks bounded series completion.
   - `reopenOccurrence`: restores occurrence to `TODO` (deletes non-rescheduled row; preserves reschedule override), reverts master task to `TODO` if series was complete.
   - `cancelOccurrence`: marks occurrence `CANCELLED` in `task_occurrences` and checks boundary accounting.
   - `rescheduleOccurrence`: records `override_due_at`/`override_due_date` while preserving canonical `occurrence_key`.
   - `getTaskOccurrences`: expands nominal occurrences and merges sparse overrides with proper date range windowing.
   - `tasks.routes.js`: Added endpoints `/:id/occurrences/:occurrenceKey/(complete|reopen|cancel|reschedule)` and `GET /:id/occurrences`. Supported both `start`/`end` and `startAt`/`endAt` query parameters in `getOccurrencesQuerySchema` to ensure arbitrary ISO date-range queries are accurately bound without falling back to relative windows.
4. **Today Command Center Integration (`today.service.js`)**:
   - Projects uncompleted recurring occurrences to `dueToday` or `overdue` using effective due date (`overrideDueAt || nominalDueAt`).
   - Retrieves `completedToday` from `task_occurrences.findCompletedOccurrencesByRange`.
   - Master task `completed_at` and `due_at` are never mutated for individual occurrence completion.
5. **Web Client Integration (`apps/web`)**:
   - `tasks.api.js`: Added `cancelTaskOccurrence`, `rescheduleTaskOccurrence`, `fetchTaskOccurrences`.
   - `TodayPage.jsx`: Dynamic occurrence completion and reopening via dedicated endpoints.

### Final Regression & Live Database Audit Results

1. **Full Verification Suite**:
   - `npm run check:js-only`: **PASSED** (0 TypeScript files).
   - `npm run lint`: **PASSED** (ESLint 9 Flat Config: 0 errors, 0 warnings).
   - `npm run format:check`: **PASSED** (Prettier code style verified across all files).
   - `npm test`: **PASSED** (458/458 tests across 40 test files; delta: +16 unit tests in `apps/backend/tests/tasks-recurrence.test.js` over the 442 Phase 10 baseline).
   - `npx playwright test`: **PASSED** (39/39 E2E tests across 6 journey test files: `calendar.spec.js`, `core-ux.spec.js`, `projects-boards.spec.js`, `recurrence.spec.js`, `tasks.spec.js`, `today.spec.js`).
   - `npm run build`: **PASSED** (Vite production bundle built cleanly in 4.36s).

2. **Live PostgreSQL 16 Catalog Audit**:
   - Verified against live container (`workaholic_dev` on PostgreSQL 16.13):
     - Table `public.task_occurrences` exists.
     - All 13 columns verified: `id` (UUID PK), `workspace_id` (UUID FK), `task_id` (UUID FK), `occurrence_key` (VARCHAR(100)), `is_all_day` (BOOLEAN), `original_due_at` (TIMESTAMPTZ), `original_due_date` (DATE), `override_due_at` (TIMESTAMPTZ), `override_due_date` (DATE), `status` (VARCHAR(50)), `completed_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ).
     - CHECK constraints: `chk_task_occurrence_status` ('TODO', 'COMPLETED', 'CANCELLED'), `chk_task_occ_due_type` (strict separation of timed vs all-day date semantics).
     - UNIQUE constraint: `uq_task_occurrence` on `(task_id, occurrence_key)`.
     - Foreign keys: `task_occurrences_workspace_id_fkey` -> `workspaces(id)` ON DELETE CASCADE, `task_occurrences_task_id_fkey` -> `tasks(id)` ON DELETE CASCADE.
     - All 5 indexes verified: PK, unique, `idx_task_occurrences_task_id`, `idx_task_occurrences_workspace_status`, `idx_task_occurrences_completed_at`.
     - Migration registration: `1725628808000_create_task_occurrences.sql` cleanly recorded in `pgmigrations`.

3. **Migration Verification**:
   - Forward migration (`node scripts/migrate.js up`): Cleanly applied.
   - Rollback migration (`node scripts/migrate.js down 1`): Cleanly reverted table and dropped indexes/constraints.
   - Re-application (`node scripts/migrate.js up`): Safe, idempotent, zero data corruption.

4. **Original Blocker Verification (Live DB)**:
   - **Blocker A (BR-TASK-008)**: Completed occurrence 1; master `tasks.due_at` remained unchanged (`2026-06-01T09:00:00.000Z`).
   - **Blocker B (Out-of-Order Orphaning)**: Completed occurrence 3 before 1; range expansion proved occurrences 1 and 2 remain `TODO` and fully actionable.
   - **Blocker C (COUNT=3 Boundary Accounting)**: Completed occurrence 3; master remained `TODO`. After completing occurrence 1, cancelling occurrence 2, and completing occurrence 3 (total accounted = 3), master transitioned to `COMPLETED`.

5. **Regressions Across Phases 5–9**:
   - Zero regressions across normal task CRUD, task completion, reopening, deletion/restore, task hierarchy, dependencies, labels, links, work blocks, projects, boards, column movement, Calendar, Today, Phase 7 core UX, recurrence events, recurrence exceptions, THIS, THIS_AND_FOLLOWING, SERIES, and timezone/DST handling.

| Check / Requirement           | Status   | Details                                                                                         |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| **BR-TASK-008 Preservation**  | **PASS** | Completing occurrence preserves master `tasks.due_at` unchanged                                 |
| **Out-of-Order Completion**   | **PASS** | Completing occurrence 3 before 1 does not orphan 1 or 2                                         |
| **COUNT Boundary**            | **PASS** | Completing occurrence 3 of 3 does not complete series; completes when COMPLETED + CANCELLED = N |
| **UNTIL Boundary**            | **PASS** | Completes only when all bounded occurrences through `end_at` are accounted for                  |
| **All-Day Semantics**         | **PASS** | Uses `DATE` (`YYYY-MM-DD`) without UTC midnight distortion                                      |
| **Reschedule Semantics**      | **PASS** | Preserves canonical `occurrence_key`; reopening preserves override                              |
| **Today Integration**         | **PASS** | `dueToday`, `overdue`, `completedToday` accurately projected from effective dates               |
| **Tenant Isolation / IDOR**   | **PASS** | Cross-workspace occurrence operations return 404 / NotFoundError                                |
| **Idempotency & Concurrency** | **PASS** | Repeated and concurrent completions resolve deterministically with zero duplicates              |
| **Live Database Catalog**     | **PASS** | Verified table, columns, types, check constraints, FK cascades, and indexes                     |
| **Migration Reversibility**   | **PASS** | `up`, `down 1`, and re-`up` tested and recorded cleanly in `pgmigrations`                       |
| **Full Vitest Suite**         | **PASS** | 458/458 passed across 40 test files (+16 tests from Phase 10.13)                                |
| **Full Playwright Suite**     | **PASS** | 39/39 passed across 6 journey test files                                                        |
| **Lint & Format & JS-only**   | **PASS** | ESLint: 0 errors/0 warnings; Prettier: passed; JS-only: 0 TS files                              |
| **Production Build**          | **PASS** | Vite production bundle built cleanly in 4.36s                                                   |

- **Phase 10.13 Status**: **VERIFIED COMPLETE**

---

## Phase 11 — Notifications & Reminders

### Execution Summary

- **Phase Objective**: Implement comprehensive multi-channel notifications and reminder engine conforming to `docs/10.NOTIFICATION-SPECIFICATION.md`, `docs/7.DATABASE-DESIGN.md`, `docs/11.PERMISSIONS-MODEL.md`, `docs/15.API-SPECIFICATION.md`, `docs/13.UX-SPECIFICATION.md`, `docs/14.DESIGN-SYSTEM.md`, `docs/16.TESTING-STRATEGY.md`, and `docs/17.TEST-MATRIX.md`.
- **Status**: **VERIFIED COMPLETE**

---

### Key Architectural Deliverables

1. **Authoritative Database Schema & Migrations**:
   - Migration `1725628809000_create_reminder_and_notification_tables.sql`:
     - `reminders`: Workspace-scoped (`workspace_id` FK), single target CHECK constraint `chk_reminders_single_target` (`task_id`, `event_id`, or `booking_id`), trigger types (`ABSOLUTE_TIME`, `BEFORE_EVENT`, `BEFORE_DEADLINE`, `RECURRING`), priorities (`LOW`, `NORMAL`, `HIGH`, `CRITICAL`), status (`PENDING`, `ACTIVE`, `CANCELLED`).
     - `reminder_recipients`: User-scoped (`user_id` FK), unique constraint `uq_reminder_recipient` on `(reminder_id, user_id)`, partial index `idx_reminder_recipients_due` on `(next_trigger_at, recipient_status) WHERE recipient_status = 'PENDING' AND dismissed_at IS NULL`.
     - `notifications`: User-scoped (`recipient_user_id` FK), `reminder_recipient_id` FK, `notification_type`, title, body, `target_reference` JSONB, `read_at`, `dismissed_at`.
     - `notification_deliveries`: Delivery audit trail per channel, unique index `uq_notification_delivery` on `(notification_id, COALESCE(device_id, '00000000-0000-0000-0000-000000000000'), channel)` preventing duplicate deliveries.
     - `trusted_relationships` & `trusted_relationship_permissions`: User-to-user trust model with CHECK constraint `chk_non_self_trust` and permission `trusted.reminders.receive`.
     - Preferences: Strictly stored in `users.preferences` JSONB without creating a separate table.

2. **Reminders Domain & Trigger Engine (`apps/backend/src/modules/reminders`)**:
   - `reminders.service.js`, `reminders.repository.js`, `trusted.repository.js`.
   - Supports absolute-time, relative before-deadline, and relative before-event triggers with automatic timezone offset calculation (`INTERVAL` object and string parser).
   - Task completion suppression: Completing a task transitions pending reminders to `CANCELLED`.
   - Event reschedule recalculation: Automatically recalculates `trigger_at` when calendar event `start_at` changes.
   - Event cancellation suppression: Soft-deleting an event suppresses pending reminders.
   - Recipient-specific snooze & dismissal: Snoozing or dismissing a reminder updates only the requesting user's recipient record without mutating the underlying source task/event or affecting other recipients.

3. **Notifications Domain & Transport Abstraction (`apps/backend/src/modules/notifications`)**:
   - `notifications.service.js`, `notifications.repository.js`, `fcm.transport.js`.
   - In-app notification center generation with immediate in-app delivery records.
   - Push delivery dispatch through `PushTransportInterface` with pluggable `MockPushTransport`, `LoggingPushTransport`, and `FcmPushTransport`.
   - Quiet hours evaluation (`users.preferences.notifications.quietHours`): Suppresses non-critical push notifications; allows CRITICAL notifications to bypass quiet hours.
   - Bounded retries and failure handling: Updates delivery to `RETRYING` on transient errors (`TEMPORARY_FAILURE`); updates to `FAILED` and deactivates invalid push tokens on permanent errors (`PERMANENT_FAILURE`).
   - Tenant & recipient isolation: Rejects unauthorized access to foreign notifications with 403 Forbidden.

4. **Shared Reminders & Trusted Authorization**:
   - Cross-workspace recipient sharing strictly guarded by active trusted relationship with `trusted.reminders.receive`.
   - Revocation prevents future shared reminder creation.

5. **In-Process Reminder Dispatcher (`apps/backend/src/modules/notifications/reminder-dispatcher.js`)**:
   - Minimal background ticker executing `runReminderSweep` using row-level locking.
   - Automatically processes due reminders, dispatches notifications, and updates recipient status to `SENT`.

6. **Web Client Notification Center & UI (`apps/web`)**:
   - `NotificationCenter.jsx`: Interactive drawer dropdown with unread badge, filter tabs ('ALL', 'UNREAD', 'REMINDER'), mark-read, dismiss, snooze actions, and deep-link routing.
   - `TopBar.jsx`: Notification bell button with real-time unread count badge.
   - `ReminderPicker.jsx`: Reusable reminder selector for tasks and calendar events.
   - `notifications.api.js`, `reminders.api.js`: Complete client API bindings.

7. **Desktop & Mobile Implementations**:
   - `apps/desktop/src/preload.js` & `main.js`: Whitelisted `desktop:show-notification` and `desktop:schedule-notification` IPC channels with security boundaries.
   - `apps/mobile/src/services/notifications.js`: Android native local alarm and push notification handlers.

### Final Audit Pass & Specification Reconciliations

1. **A. Notification Channels**:
   - Reconciled against `docs/10.NOTIFICATION-SPECIFICATION.md` Section 4.
   - Removed unauthorized future channels `EMAIL` and `SMS` from `NOTIFICATION_CHANNEL` in `packages/shared/src/constants/index.js`.
   - Removed `email` from `notificationPreferencesSchema` in `packages/shared/src/schemas/index.js`.
   - Updated database migration `1725628809000_create_reminder_and_notification_tables.sql` constraint `chk_delivery_channel` to strictly `('IN_APP', 'PUSH', 'WINDOWS_DESKTOP', 'ANDROID_LOCAL')`. Re-migrated down and up cleanly on live PostgreSQL 16.
2. **B. Device API Specification**:
   - Conformed device endpoints to `docs/15.API-SPECIFICATION.md` Section 52:
     - Implemented authoritative `POST /devices` (registration with 201 Created), `PATCH /devices/{id}`, and `DELETE /devices/{id}`.
     - Retained `POST /devices/register-push` as backward-compatible alias.
     - Confirmed `/notification-preferences` is authoritative per Section 51, retaining `/notifications/preferences` as an alias.
3. **C. Reminder Trigger & Recurrence Engine**:
   - Verified `RECURRING_TIME` semantics:
     - `dismissReminder` with `dismissAllOccurrences: false` advances recurrence trigger to next occurrence without disabling future recurrences (`NOTIF-T07`).
     - Added `advanceRecipientRecurrence(id, nextTrigger)` to `reminders.repository.js`.
     - In `processDueReminders`, recurring reminders deliver the occurrence notification and automatically advance `next_trigger_at` to the next cycle while maintaining `PENDING` state.
     - `dismissReminder` with `dismissAllOccurrences: true` permanently sets `DISMISSED`.
4. **D. Delivery Lifecycle & Bounded Retries**:
   - Verified delivery lifecycle states: `PENDING`, `SENT`, `DELIVERED`, `FAILED`, `RETRYING`, `CANCELLED`.
   - Added `attempt_count` column to `notification_deliveries` table and updated repository mappings.
   - Enforced bounded retries: transient transport failures increment `attempt_count`; after reaching 3 attempts, delivery transitions permanently to `FAILED` without infinite retries (`NOTIF-T19`, `NOTIF-T20`).
5. **E. Background Dispatcher Boundary & Concurrency**:
   - In `findDueReminderRecipients`, added `FOR UPDATE OF rr SKIP LOCKED` when running within a transaction boundary (`withTransaction`).
   - Multiple concurrent sweeps skip locked rows, eliminating race conditions and duplicate dispatches without requiring generic worker fleets or Redis (`NOTIF-T09`).
   - External network push dispatch runs safely outside the database transaction boundary.
6. **F. Platform Claims Clarification**:
   - Windows Desktop: Electron IPC contract (`desktop:show-notification`, `desktop:schedule-notification`) with `electron.Notification.show()`.
   - Android Mobile: Expo/React Native service contract (`apps/mobile/src/services/notifications.js`).
   - Platform verification accurately reflects client IPC/service contracts; native OS background alarm managers (AlarmManager / WorkManager) and system tray persistence are formally scheduled for Phase 26–28 per `docs/phase-wise-plan.md`.
7. **G. Offline Behavior Clarification**:
   - Local reminder contracts defined in mobile & desktop layers.
   - Full offline SQLite replication and multi-device offline reconciliation are scheduled for Phase 26–28.
8. **H. Shared Reminder Revocation Enforcement**:
   - Fixed `processDueReminders` to re-evaluate active trust permission at trigger time for cross-workspace recipients.
   - If trusted relationship has been revoked, recipient status is marked `CANCELLED` and notification generation is suppressed, preventing unauthorized notifications from leaking data (`NOTIF-T14`).

---

### Verification Results

| Check / Requirement          | Status   | Details                                                                                           |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| **Strict JavaScript-Only**   | **PASS** | `npm run check:js-only`: 0 TypeScript files across entire monorepo                                |
| **ESLint 9 Flat Config**     | **PASS** | `npm run lint`: 0 errors, 0 warnings across all files                                             |
| **Prettier Formatting**      | **PASS** | `npm run format:check`: All files conform to repository formatting                                |
| **Vitest Test Suite**        | **PASS** | `npm test`: 499/499 passed across 47 test files (+41 tests added in Phase 11)                     |
| **Playwright E2E Suite**     | **PASS** | `npx playwright test`: 43/43 passed across 7 test files (+4 E2E tests in `notifications.spec.js`) |
| **Live Database Migrations** | **PASS** | `npm --workspace=@workaholic/backend run migrate:status`: All migrations applied cleanly          |
| **Live PostgreSQL 16 Suite** | **PASS** | `reminders-live.test.js`: Verified single target CHECK, non-self-trust CHECK, partial indexes     |
| **Vite Production Build**    | **PASS** | `npm run build`: Production bundle built cleanly in 2.44s                                         |

- **Phase 11 Status**: **FINAL AUDIT PASSED & VERIFIED COMPLETE**

---

## Phase 12: Background Job Infrastructure

### Overview

Established a general-purpose, robust PostgreSQL-backed asynchronous background job subsystem for Workaholic conforming to `docs/phase-wise-plan.md` Section 16, `docs/6.SYSTEM-ARCHITECTURE.md` Section 35–36, and `AGENTS.md`. The infrastructure supports reliable asynchronous execution of reminders, recurrences, sync, and cleanup with atomic row claiming (`FOR UPDATE SKIP LOCKED`), exponential backoff retries, non-retryable fatal error routing to `DEAD_LETTER`, automatic recovery of stale/abandoned locks, in-process worker lifecycle with adaptive polling, and clean integration with Phase 11 reminder dispatching.

### Architecture & Implementation Details

1. **Job Schema & States (`1725628810000_enhance_background_jobs.sql`)**:
   - Supported lifecycle states: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`, and `DEAD_LETTER`.
   - Added `dead_letter_reason TEXT` for post-mortem diagnostics on terminal or non-retryable failures.
   - Added `job_key VARCHAR(255)` with partial unique index `idx_background_jobs_job_key ON background_jobs (queue, job_key) WHERE status IN ('PENDING', 'PROCESSING')` for enqueue-time deduplication.
   - Added partial index `idx_background_jobs_stale_recovery ON background_jobs (status, locked_at) WHERE status = 'PROCESSING'` for high-speed crash recovery.
   - Added partial index `idx_background_jobs_dead_letter ON background_jobs (queue, status) WHERE status = 'DEAD_LETTER'`.

2. **Atomic Row Claiming (`FOR UPDATE SKIP LOCKED`)**:
   - `fetchNextPendingJob`: Runs inside an isolated database transaction, querying `SELECT ... FOR UPDATE SKIP LOCKED` sorted by `priority DESC, run_at ASC, id ASC LIMIT 1`.
   - Atomically transitions claimed row to `PROCESSING`, increments `attempts = attempts + 1`, and stamps `locked_at = CURRENT_TIMESTAMP` and `locked_by = workerId`.
   - Concurrent workers claim distinct jobs simultaneously with zero lock contention or duplicate execution.

3. **Retries, Backoff & Dead-Letter Routing**:
   - Exponential backoff calculation: `delay = Math.min(baseDelay * Math.pow(backoffFactor, attempts - 1), maxDelay)`.
   - Bounded retries: when `attempts < maxAttempts` and failure is retryable, resets status to `PENDING` with future `run_at`.
   - Terminal exhaustion: when `attempts >= maxAttempts`, transitions to `FAILED` with diagnostic failure reason.
   - Non-retryable failures: when `err.nonRetryable === true` or fatal invariant violation occurs, routes immediately to `DEAD_LETTER` without wasting retry attempts.
   - Dedicated `deadLetterJob(jobId, reason)` and `cancelJob(jobId)` primitives.

4. **Crash & Abandonment Recovery (`recoverStaleJobs`)**:
   - Atomic CTE query detects orphaned `PROCESSING` jobs where `locked_at < NOW() - staleTimeout`.
   - If attempts are exhausted, marks as `DEAD_LETTER`.
   - Otherwise, releases lock and reschedules to `PENDING` with a brief delay, allowing healthy workers to pick it up.

5. **Worker Lifecycle & Adaptive Polling (`JobWorker`)**:
   - Class `JobWorker` manages the asynchronous polling loop and periodic stale job recovery.
   - Adaptive polling backoff: polls immediately when active work is processed, backing off to higher intervals (up to 3000ms) when queue is idle, eliminating database CPU thrashing.
   - Handler isolation: uncaught errors or rejections in handlers are captured, recorded in the database, and never crash the worker loop.
   - Graceful shutdown (`worker.stop(timeoutMs)`): stops timer loop and awaits in-flight handler execution before resolving.

6. **Phase 11 Reminder Integration**:
   - Registered `REMINDER_SWEEP` and `REMINDER_DISPATCH` handlers on `jobQueue`.
   - `enqueueReminderSweep`: Deduplicates sweeps within a 30-second window via `jobKey`.
   - Integrated with Fastify lifecycle: in non-test environments, starts `JobWorker` for the `notifications` queue and cleanly stops on `app.close()`.
   - Preserves all Phase 11 domain behavior, recurrence semantics, push delivery, and recipient isolation.

---

### Verification Results

| Check / Requirement          | Status   | Details                                                                                            |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| **Strict JavaScript-Only**   | **PASS** | `npm run check:js-only`: 0 TypeScript files across entire monorepo                                 |
| **ESLint 9 Flat Config**     | **PASS** | `npm run lint`: 0 errors, 0 warnings across all workspaces                                         |
| **Prettier Formatting**      | **PASS** | `npm run format:check`: All files conform to repository formatting                                 |
| **Vitest Test Suite**        | **PASS** | `npm test`: 511/511 passed across 48 test files (+12 tests added in Phase 12)                      |
| **Playwright E2E Suite**     | **PASS** | `npx playwright test`: 43/43 passed across 7 test files                                            |
| **Live Database Migrations** | **PASS** | `npm --workspace=@workaholic/backend run migrate:status`: All migrations applied cleanly           |
| **Live PostgreSQL 16 Suite** | **PASS** | `queue.test.js` & `worker.test.js`: Verified SKIP LOCKED concurrency, backoff, deduplication, etc. |
| **Vite Production Build**    | **PASS** | `npm run build`: Production bundle built cleanly in 2.64s                                          |

- **Phase 12 Status**: **COMPLETE & VERIFIED**

---

## Phase 13: Google Calendar Integration

> **Implementation & Verification Status**: **COMPLETE & VERIFIED**  
> **Test Results**: Vitest 540/540 passing (50 test files), Playwright 44/44 passing (8 test files), JS-only 100%, ESLint 0 errors / 0 warnings, Prettier 100%, Migrations up to date.

### Core Deliverables Implemented & Verified

1. **Security & OAuth 2.0 Boundary (`oauth-boundary.service.js`)**:
   - Implemented OAuth 2.0 authorization URL generator and code-token exchange boundary.
   - Enforced HMAC-SHA256 signed OAuth state tokens with expiration (10m) and replay protection to prevent cross-tenant/cross-user CSRF hijacking.
   - Encrypted refresh tokens and credentials at rest using AES-256-GCM (`crypto.js`) with IV and authentication tags.
   - Credentials remain strictly server-side; zero plaintext tokens or secrets returned in API responses, logs, or client-side storage.
   - Disconnect safely wipes credentials and transitions integration status to `DISCONNECTED` while preserving user native calendar data.

2. **External Integration Schema & Migrations (`1725628811000_create_external_sync_and_mappings.sql`)**:
   - `integrations`: Tracks user connection state (`CONNECTED`, `DISCONNECTED`, `REVOKED`), timestamps, and scopes.
   - `external_accounts`: Stores encrypted credentials, display name, and external account IDs.
   - `calendar_external_mappings`: Maps Workaholic native calendars to Google calendars with sync tokens and sync states.
   - `event_external_mappings`: Maps Workaholic native events to Google event IDs (`native_resource_id`, `external_resource_id`, provider `GOOGLE`), tracking ETags and modification timestamps.
   - `sync_history`: Logs audit trail of sync executions, counts (imported, exported, deleted, conflicts), and failure reasons.

3. **Google Calendar Adapter & Event Mapper (`google-calendar.adapter.js`, `google-calendar.mapper.js`)**:
   - Isolated integration boundary: all external Google API interactions encapsulated in `GoogleCalendarAdapter` without leaking into repositories or UI.
   - Bidirectional event mapping:
     - All-day event boundaries: preserves pure-date semantics (`startDate`/`endDate`) without timezone shifting or UTC conversions.
     - Timed events: converts between ISO UTC strings and Google date-time objects with timezone metadata.
     - Cancellation/deletion semantics: Google `cancelled` status marks native events as `CANCELLED` and mappings as `DELETED_EXTERNALLY` without deleting native rows.
     - Recurrence series: recurring Google events map directly to Workaholic `recurrence_rules` rows, attaching `recurrenceRuleId` to the native event.

4. **Two-Way Synchronization Engine (`google-calendar-sync.service.js`)**:
   - Calendar discovery: automatically lists accessible Google calendars with `isPrimary: Boolean(gCal.primary)` metadata and creates native calendar mappings.
   - Deterministic conflict resolution: compares modification timestamps (`nativeModified > lastNativeSync` vs `externalModified > lastExtSync`); native-originated modifications take precedence over external edits and flag mapping status as `CONFLICT`, eliminating arbitrary last-write-wins races.
   - Write-back loop prevention: preserves last sync timestamps per boundary so outbound sync updates are not re-imported as new changes.
   - Multi-tenant isolation: enforces `userId` and `workspaceId` checks on all operations; returns `NOT_CONNECTED` when attempting sync on unlinked integrations.

5. **Phase 12 Background Queue Integration (`google-sync-dispatcher.js`)**:
   - Registered `GOOGLE_CALENDAR_SYNC` job handler on the Phase 12 `JobQueue`.
   - Supports asynchronous sync execution via `POST /api/v1/integrations/google/calendar/sync?async=true`, returning `jobId` and queuing the task for worker processing.

6. **Web Client Integration & UI (`GoogleSyncModal.jsx`, `CalendarFilterPanel.jsx`)**:
   - Added Google Calendar synchronization trigger to `CalendarFilterPanel.jsx`.
   - Implemented `GoogleSyncModal.jsx` displaying connection status, discovered calendars, primary badge, manual "Sync Now" trigger with result summaries, and safe disconnect confirmation.
   - Full Playwright E2E browser journey (TM-CAL-014) verifying disconnect -> connect -> discover calendars -> sync -> disconnect.

---

### Phase 13 Audit & Resolution of 7 Specific Issues

| Issue       | Description                            | Fix & Verification                                                                                                                                                                                                                    |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Issue 1** | OAuth credentials parsing              | Updated `decryptCredentials` in `crypto.js` and `mapExternalAccountRow` in `integrations.repository.js` to seamlessly support both JSON strings, JSONB objects, and base64 strings.                                                   |
| **Issue 2** | Calendar discovery properties          | Ensured discovered calendar representations explicitly include `isPrimary: Boolean(gCal.primary)` matching the API contract.                                                                                                          |
| **Issue 3** | Tenant isolation / error contract      | Aligned error responses to return `NOT_CONNECTED` (`code: 'NOT_CONNECTED'`) on status 400 when an unauthenticated/unconnected user initiates calendar operations.                                                                     |
| **Issue 4** | All-day event boundaries               | Fixed mapper to use pure date strings (`startDate`/`endDate`) for Google all-day events, preventing timezone offset day-shifting. Added timezone boundary regression test.                                                            |
| **Issue 5** | Cancelled/deleted Google events        | When a Google event is cancelled externally, the native event status is updated to `CANCELLED` and mapping to `DELETED_EXTERNALLY` without deleting the native record.                                                                |
| **Issue 6** | Conflict-resolution timestamp handling | Replaced arbitrary timestamp offsets with deterministic synchronization boundary tracking; native modifications prioritize native data and record `CONFLICT` without infinite write-back loops. Added comprehensive regression tests. |
| **Issue 7** | Recurrence-series mapping              | Integrated Google recurring events with Phase 10 `recurrence_rules`; creates and links `recurrenceRuleId` to the native event representation and maintains occurrence expansion integrity.                                            |

---

### Verification Results

| Check / Requirement                | Status   | Details                                                                                  |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| **Strict JavaScript-Only**         | **PASS** | `npm run check:js-only`: 0 TypeScript files across entire monorepo                       |
| **ESLint 9 Flat Config**           | **PASS** | `npm run lint`: 0 errors, 0 warnings across all workspaces                               |
| **Prettier Formatting**            | **PASS** | `npm run format:check`: 100% matched files use Prettier code style                       |
| **Google Calendar Focused Vitest** | **PASS** | `npx vitest run apps/backend/tests/google-calendar-sync.test.js`: 25/25 passed           |
| **Full Vitest Test Suite**         | **PASS** | `npm test`: 540/540 passed across 50 test files                                          |
| **Playwright E2E Suite**           | **PASS** | `npx playwright test`: 44/44 passed across 8 test files (including TM-CAL-014)           |
| **Live Database Migrations**       | **PASS** | `npm --workspace=@workaholic/backend run migrate:status`: All migrations applied cleanly |
| **Vite Production Build**          | **PASS** | `npm run build`: Production bundle built cleanly in 2.12s                                |
| **Credential / Log Leak Audit**    | **PASS** | 0 secrets or tokens exposed in responses, storage, frontend bundles, or logs             |

- **Phase 13 Status**: **COMPLETE & VERIFIED**
- **Next Phase**: Phase 14 — Google Tasks Integration

---

## Phase 14: Google Tasks Integration

> **Implementation & Verification Status**: **COMPLETE & VERIFIED**  
> **Test Results**: Vitest 570/570 passing (52 test files, +30 tests added in Phase 14), Playwright 45/45 passing (+1 E2E journey added), JS-only 100%, ESLint 0 errors / 0 warnings, Prettier 100%, Migrations up to date.

### Core Deliverables Implemented & Verified

1. **OAuth 2.0 Multi-Service Scope Union (`oauth-boundary.service.js`)**:
   - Reused Phase 13 Google OAuth 2.0 infrastructure without creating duplicate authentication systems.
   - Enforced minimum required Tasks scope (`https://www.googleapis.com/auth/tasks`) via `GOOGLE_API_SCOPES.TASKS`.
   - Updated `exchangeAuthorizationCode` to union existing and new scopes, allowing users to connect Google Calendar, Google Tasks, or both independently without dropping credentials or permissions.
   - Preserved server-side encrypted credentials at rest via AES-256-GCM; zero plaintext tokens exposed to client bundles, frontend storage, API responses, or logs.

2. **Database Migration & Schema Normalization (`1725628812000_enhance_external_mappings_for_google_tasks.sql`)**:
   - Extended `external_object_mappings` check constraints to support `external_object_type = 'TASK_LIST'` and `native_object_type = 'PROJECT'`.
   - Added provenance tracking columns `source_type` (`'WORKAHOLIC'`, `'GOOGLE'`, `'IMPORTED'`) and `source_reference` (external object identifier) to the `tasks` table with index `idx_tasks_source_reference`.
   - Native Workaholic IDs remain completely decoupled from external Google Task IDs (`REQ-GTASK-003`).

3. **Google Tasks API Adapter & Mapper (`google-tasks.adapter.js`, `google-tasks.mapper.js`)**:
   - Created pure JavaScript `GoogleTasksAdapter` encapsulating Google Tasks REST API (`/users/@me/lists`, `/lists/{listId}/tasks`).
   - Implemented `MockGoogleTasksAdapter` providing deterministic, in-memory state for automated unit and integration testing without external network flakiness.
   - Implemented bidirectional mapper:
     - Preserves rich native metadata (`priority`, `labels`, `estimatedDuration`, `recurrenceRuleId`, `assignedTo`) without data loss (`REQ-GTASK-004`).
     - Maps statuses between Google (`needsAction` / `completed`) and Workaholic (`TODO` / `IN_PROGRESS` / `BLOCKED` / `COMPLETED` / `CANCELLED`).
     - Preserves due date timestamps and parent/child subtask hierarchies.

4. **Two-Way Synchronization Engine (`google-tasks-sync.service.js`)**:
   - **Task List Discovery**: Maps Google Task Lists to Workaholic Project containers and stores persistent `external_object_mappings` records (`REQ-GTASK-001`).
   - **Inbound Sync**: Imports new and modified external tasks, assigns `source_type = 'GOOGLE'`, and updates mapping boundaries.
   - **Outbound Sync**: Detects native changes and updates Google Tasks with completion timestamps.
   - **Deletion Semantics**: External deletion marks mapping `DELETED_EXTERNALLY` and transitions native task to `CANCELLED` without hard-deleting native records. Native tasks survive disconnect (`REQ-GTASK-005`).
   - **Deterministic Conflict Resolution**: Conforms to `docs/8.SYNC-SPECIFICATION.md` (Cases A, B, C, D, E). Native modifications take precedence in simultaneous conflicts and record conflict states without infinite sync loops.

5. **Phase 12 Background Queue Dispatcher (`google-sync-dispatcher.js`)**:
   - Registered `JOB_TYPE.GOOGLE_TASKS_SYNC` and `JOB_TYPE.TASKS_SYNC` handlers on `jobQueue`.
   - `enqueueGoogleTasksSync`: Uses deterministic deduplication key (`google_tasks_sync_{userId}_{keyTarget}`) on queue `'sync'`.
   - Handles transient rate limit errors (`429`) with bounded exponential backoff retries.

6. **Web Client Integration & UI (`GoogleTasksSyncModal.jsx`, `TasksPage.jsx`)**:
   - Added "Google Tasks" button to `TasksPage.jsx` header.
   - Implemented `GoogleTasksSyncModal.jsx` displaying connection status, discovered task lists, default list badges, manual "Sync Now" trigger, error states, and safe disconnect confirmation.
   - Full Playwright E2E browser journey (TM-GTASK-001) verifying disconnect -> connect -> discover task lists -> sync -> safe disconnect.

---

### Final Architectural Audit Breakdown

- **1. Google-wide Disconnect Behavior**:
  - `POST /api/v1/integrations/google/tasks/disconnect`: Scoped strictly to Tasks. Detaches `TASK` and `TASK_LIST` mappings, filters out Tasks OAuth scopes, and preserves Google Calendar credentials and mappings if Calendar is still authorized.
  - `POST /api/v1/integrations/google/calendar/disconnect`: Scoped strictly to Calendar. Detaches `CALENDAR` and `EVENT` mappings, filters out Calendar OAuth scopes, and preserves Google Tasks credentials and mappings if Tasks is still authorized.
  - `DELETE /api/v1/integrations/google`: Global integration disconnect. Completely disconnects the Google integration, detaches all Google mappings, and wipes external account credentials.
  - Verified with automated coexistence integration tests (`google-tasks-sync.test.js`).

- **2. Task List → Project Mapping**:
  - Google Task Lists map to Workaholic Project containers via `external_object_mappings` (`TASK_LIST` -> `PROJECT`).
  - Native projects remain first-class Workaholic entities. Pre-existing projects survive external list disconnect; only external mappings are detached.
  - Native inbox tasks without a project remain supported; external task identity is decoupled from native project identity.

- **3. Native Feature Preservation**:
  - Workaholic fields unsupported by Google Tasks (`priority`, `labels`, `estimatedDuration`, `recurrenceRuleId`, `assignedTo`, dependencies, attachments) are strictly preserved.
  - The provider mapper never overwrites missing external fields with `null`, defaults, or empty arrays.

- **4. Synchronization & Conflict Semantics**:
  - Evaluated and verified against `SYNC-SPECIFICATION.md`:
    - Native-only change propagates externally.
    - External-only change propagates natively.
    - Simultaneous conflict applies deterministic native precedence with conflict state tracking.
    - No-op sync generates zero spurious mutations.
    - External deletion transitions native task to `CANCELLED` and mapping to `DELETED_EXTERNALLY` (no destructive hard deletes).

- **5. Tenant Isolation & Security Boundary**:
  - All endpoints enforce workspace and user boundaries (`requireAuth`, `userId` filtering).
  - External credentials remain encrypted via AES-256-GCM; zero credentials leaked in responses or client state.

---

### Verification Results

| Check / Requirement             | Status   | Details                                                                                  |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| **Strict JavaScript-Only**      | **PASS** | `npm run check:js-only`: 0 TypeScript files across entire monorepo                       |
| **ESLint 9 Flat Config**        | **PASS** | `npm run lint`: 0 errors, 0 warnings across all workspaces                               |
| **Prettier Formatting**         | **PASS** | `npm run format:check`: 100% matched files use Prettier code style                       |
| **Google Tasks Focused Vitest** | **PASS** | `npx vitest run apps/backend/tests/google-tasks-sync.test.js`: 25/25 passed              |
| **Google Tasks Web Component**  | **PASS** | `npx vitest run apps/web/tests/google-tasks-sync.test.jsx`: 5/5 passed                   |
| **Google Calendar Regression**  | **PASS** | `npx vitest run apps/backend/tests/google-calendar-sync.test.js`: 25/25 passed           |
| **Full Vitest Test Suite**      | **PASS** | `npm test`: 570/570 passed across 52 test files                                          |
| **Playwright E2E Suite**        | **PASS** | `npx playwright test`: 45/45 passed (including TM-GTASK-001 in `e2e/tasks.spec.js`)      |
| **Live Database Migrations**    | **PASS** | `npm --workspace=@workaholic/backend run migrate:status`: All migrations applied cleanly |
| **Vite Production Build**       | **PASS** | `npm run build`: Production bundle built cleanly in 1.92s                                |
| **Credential / Log Leak Audit** | **PASS** | 0 secrets or tokens exposed in responses, storage, frontend bundles, or logs             |

- **Phase 14 Status**: **COMPLETE & VERIFIED**
- **Next Phase**: Phase 15 — Google Drive Integration

---

## Phase 15: Google Drive Integration

### Overview

Implemented **Google Drive-backed attachment storage and synchronization** for Workaholic conforming to `docs/1.project.md`, `docs/2.requirements.md` (`REQ-GDRIVE-001` through `REQ-GDRIVE-006`), `docs/7.DATABASE-DESIGN.md` Section 27, `docs/8.SYNC-SPECIFICATION.md` Section 61–63, `docs/15.API-SPECIFICATION.md` Section 47, `docs/19.INTEGRATION-SPECIFICATION.md` Section 25–29, and `AGENTS.md`.

Workaholic attachments leverage user-authorized Google Drive storage while preserving native attachment relationship authority, tenant and workspace isolation, deterministic folder discovery, and strict distinction between non-destructive attachment detach and explicit, permission-gated Drive file deletion.

---

### Core Deliverables Implemented & Verified

1. **OAuth 2.0 Multi-Service Scope Lifecycle (`oauth-boundary.service.js`)**:
   - Reused existing Google OAuth 2.0 foundation without creating parallel authentication implementations.
   - Enforced minimum required Drive scope (`https://www.googleapis.com/auth/drive.file`) via `GOOGLE_API_SCOPES.DRIVE`.
   - Enhanced multi-service scope unioning: users can authorize any combination of Google Calendar, Google Tasks, and Google Drive independently.
   - Disconnecting Google Drive (`POST /api/v1/integrations/google/drive/disconnect`) filters out the Drive scope and detaches Drive file mappings while leaving Calendar and Tasks credentials, mappings, and sync states completely unaffected.
   - Refresh tokens remain encrypted at rest via AES-256-GCM. Zero tokens exposed in API payloads, browser storage, or logs.

2. **Database Migration & Schema Normalization (`1725628813000_create_attachments_and_drive_mappings.sql`)**:
   - Created authoritative `attachments` table conforming to `docs/7.DATABASE-DESIGN.md` Section 27.1 (`id`, `workspace_id`, `target_type`, `target_id`, `source_type`, `file_name`, `mime_type`, `size_bytes`, `external_file_id`, `upload_status`, `web_url`).
   - Created `external_files` cache table conforming to Section 27.2 (`provider`, `external_file_id`, `name`, `mime_type`, `size_bytes`, `external_parent_id`).
   - Extended `external_object_mappings` check constraints to support `external_object_type IN ('FILE', 'FOLDER')` and `native_object_type = 'ATTACHMENT'`.
   - Native Workaholic UUIDs remain completely decoupled from external Google Drive file IDs (`REQ-GDRIVE-003`).

3. **Dedicated Workaholic Drive Folder (`google-drive-sync.service.js`)**:
   - Idempotently creates and reuses a dedicated folder named `'Workaholic Attachments'` in the user's Google Drive (`REQ-GDRIVE-006`).
   - Mapped in `external_object_mappings` with `external_object_type = 'FOLDER'` and `native_object_type = 'WORKSPACE'`.
   - Safely detects missing or externally trashed folders; cleans up stale mappings before re-creating to avoid database constraint violations.

4. **Upload Flow & External Mapping (`attachments.routes.js`, `google-drive.adapter.js`)**:
   - Implemented upload pipeline: validates file and workspace permissions -> creates native attachment record with `UPLOAD_STATUS.PENDING` -> executes Drive file upload -> persists `external_object_mappings` and `external_files` -> marks attachment as `COMPLETED`.
   - Supports retryable failed uploads via background job queue with transient error classification (network timeout, rate limit).

5. **Critical Detach Semantics vs. Explicit Drive Deletion (`REQ-GDRIVE-004`, `REQ-GDRIVE-005`)**:
   - **Detach (`DELETE /api/v1/attachments/:id`)**: Removes the native Workaholic attachment relationship only. The external Google Drive file is **NEVER** deleted, and remains safely intact in the user's Drive.
   - **Explicit Deletion (`DELETE /api/v1/attachments/:id?deleteDriveFile=true` or `DELETE /api/v1/integrations/google/drive/files/:fileId`)**: Permitted only via an explicit, dedicated user action requiring confirmation. Calls Drive API `deleteFile` and cleans up external mappings. Already-deleted external files are handled idempotently (`404` -> success).

6. **External File Edge Cases (`docs/8.SYNC-SPECIFICATION.md` Section 62)**:
   - Missing external files: marked as `SYNC_STATE.DELETED_EXTERNALLY` and attachment status updated to `FAILED` without crashing sync.
   - Externally trashed files: detected via `trashed: true` and mapped to `DELETED_EXTERNALLY`.
   - Moved files: parent folder update updates mapping container ID while preserving immutable Drive file ID.
   - Token revocation: triggers standard 401 re-auth flow without destroying native attachment metadata.

7. **Background Queue Dispatcher (`google-sync-dispatcher.js`)**:
   - Registered `JOB_TYPE.GOOGLE_DRIVE_UPLOAD` and `JOB_TYPE.GOOGLE_DRIVE_SYNC` on Phase 12 `jobQueue`.
   - Uses deterministic deduplication key (`google_drive_upload_{userId}_{targetId}_{fileName}`) on queue `'sync'`.
   - Classifies HTTP 429 rate limit responses as transient for bounded exponential backoff retries.

8. **Web Client Integration & UI (`GoogleDriveModal.jsx`, `TaskAttachments.jsx`, `TaskDetailDrawer.jsx`)**:
   - Created `GoogleDriveModal.jsx` for Drive OAuth initiation, active status display, dedicated folder confirmation, and safe disconnect dialog.
   - Created `TaskAttachments.jsx` embedded in `TaskDetailDrawer.jsx`:
     - Displays attachments list with file icons, formatted sizes, synced badges, and direct external Google Drive links.
     - Upload button with file picker and upload progress indicator.
     - Separate Detach button (with dialog warning that Drive file remains preserved).
     - Explicit Delete button (with prominent red destructive confirmation dialog).
   - Created E2E test `TM-GDRIVE-001` in `e2e/tasks.spec.js` testing complete attachment lifecycle.

---

### Verification Results

| Check / Requirement             | Status   | Details                                                                                  |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| **Strict JavaScript-Only**      | **PASS** | `npm run check:js-only`: 0 TypeScript files across entire monorepo                       |
| **ESLint 9 Flat Config**        | **PASS** | `npm run lint`: 0 errors, 0 warnings across all workspaces                               |
| **Prettier Formatting**         | **PASS** | `npm run format:check`: 100% matched files use Prettier code style                       |
| **Google Drive Focused Vitest** | **PASS** | `npx vitest run apps/backend/tests/google-drive-sync.test.js`: 26/26 passed              |
| **Google Drive Web Vitest**     | **PASS** | `npx vitest run apps/web/tests/google-drive-attachments.test.jsx`: 9/9 passed            |
| **Google Tasks Regression**     | **PASS** | `npx vitest run apps/backend/tests/google-tasks-sync.test.js`: 25/25 passed              |
| **Google Calendar Regression**  | **PASS** | `npx vitest run apps/backend/tests/google-calendar-sync.test.js`: 25/25 passed           |
| **Full Vitest Test Suite**      | **PASS** | `npm test`: 605/605 passed across 54 test files (+35 tests added in Phase 15)            |
| **Playwright E2E Suite**        | **PASS** | `npx playwright test`: 46/46 passed (including TM-GDRIVE-001 in `e2e/tasks.spec.js`)     |
| **Live Database Migrations**    | **PASS** | `npm --workspace=@workaholic/backend run migrate:status`: All migrations applied cleanly |
| **Vite Production Build**       | **PASS** | `npm run build`: Production bundle built cleanly in 7.60s                                |
| **Security & Privacy Audit**    | **PASS** | 0 secrets/tokens exposed; encrypted credentials at rest; tenant and workspace isolation  |

- **Phase 15 Status**: **COMPLETE & VERIFIED**
- **Next Phase**: Phase 16 — Synchronization Hardening

---

## Phase 16: Synchronization Hardening (Complete)

### Implementation Overview

Phase 16 hardened the bidirectional synchronization engine across Google Calendar, Google Tasks, and Google Drive integrations, delivering production reliability under real-world network, concurrency, and distributed state conditions:

1. **Explicit Synchronization State Machine**:
   - Implemented standard states: `IDLE`, `SYNCING`, `SUCCEEDED`, `FAILED`, `RETRYING`, `CONFLICT`, `DETACHED`, `UNAVAILABLE`.
   - Built state transition validator (`sync-state-machine.js`) preventing invalid state jumps.
   - Enforced stale sync threshold (15 minutes) with automatic lock reclamation and status restoration.
2. **Idempotency & Convergence Engine**:
   - Guarantee: Sync #1 applies delta; Sync #2 produces 0 changes, 0 duplicate events/tasks, 0 provider writes; Sync #3 converges to stable identical state.
   - Strict timestamp comparison (`nativeModified > lastNativeSync`) prevents spurious provider writes while correctly detecting millisecond-level local modifications.
   - External etags and modification times are tracked with clock skew tolerance for cross-system delta identification.
3. **Provider Error Classification & Bounded Exponential Backoff**:
   - Canonical categories: `AUTHENTICATION`, `RATE_LIMIT`, `TRANSIENT`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `PERMANENT`, `UNKNOWN`.
   - Granular failure reasons (`AUTHORIZATION_REVOKED`, `PROVIDER_RATE_LIMIT`, `PROVIDER_UNAVAILABLE`, `NETWORK_FAILURE`, `INVALID_MAPPING`, `PERMISSION_DENIED`, etc.).
   - Retryable classifications integrated with Phase 12 PostgreSQL JobQueue.
4. **Recovery & Resynchronization Architecture**:
   - Automated recovery for expired sync tokens / cursors (HTTP 410 Gone fallback to full sync).
   - In-flight mutex locks per `userId:service:targetId` to eliminate concurrent overlapping sync executions.
   - Job queue deduplication keys (`google-sync:{userId}:{service}:{targetId}`) to prevent redundant background queue build-up.
   - Self-service recovery endpoint (`POST /api/v1/integrations/google/recover`) to clear stale sync locks and invalidate stale cursors.
5. **Synchronization Diagnostics & Observability**:
   - PostgreSQL schema migration `1725628814000_create_sync_diagnostics.sql` creating tenant-isolated `sync_diagnostics` table.
   - Repository `sync-diagnostics.repository.js` tracking correlation IDs, timings, counters (examined, created, updated, deleted, conflicts), error classifications, and retry states.
   - Public diagnostic endpoint (`GET /api/v1/integrations/google/diagnostics`) with sanitized output strictly scrubbing tokens and credentials.

### Verification Results

| Check / Requirement                 | Status   | Details                                                                                  |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| **Strict JavaScript-Only**          | **PASS** | `npm run check:js-only`: 0 TypeScript files across entire monorepo                       |
| **ESLint 9 Flat Config**            | **PASS** | `npm run lint`: 0 errors, 0 warnings across all workspaces                               |
| **Prettier Formatting**             | **PASS** | `npm run format:check`: 100% matched files use Prettier code style                       |
| **Sync Hardening Focused Vitest**   | **PASS** | `npx vitest run apps/backend/tests/sync-hardening.test.js`: 24/24 passed                 |
| **Google Calendar Sync Regression** | **PASS** | `npx vitest run apps/backend/tests/google-calendar-sync.test.js`: 25/25 passed           |
| **Google Tasks Sync Regression**    | **PASS** | `npx vitest run apps/backend/tests/google-tasks-sync.test.js`: 25/25 passed              |
| **Google Drive Sync Regression**    | **PASS** | `npx vitest run apps/backend/tests/google-drive-sync.test.js`: 26/26 passed              |
| **Full Vitest Test Suite**          | **PASS** | `npm test`: 629/629 passed across 55 test files (+24 tests added in Phase 16)            |
| **Playwright E2E Suite**            | **PASS** | `npx playwright test`: 46/46 passed across 7 spec files                                  |
| **Live Database Migrations**        | **PASS** | `npm --workspace=@workaholic/backend run migrate:status`: All migrations applied cleanly |
| **Vite Production Build**           | **PASS** | `npm run build`: Production bundle built cleanly in 2.14s                                |
| **Security & Privacy Audit**        | **PASS** | 0 secrets/tokens exposed in diagnostics; tenant isolation strictly verified              |

- **Phase 16 Status**: **COMPLETE & VERIFIED**
- **Next Phase**: Phase 17 — Notes
