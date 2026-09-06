# AGENTS.md — Workaholic AI Assistant Operational Guide

> **Authoritative Operational Instructions for AI Assistants**  
> **Project:** Workaholic  
> **Status:** Active Development (Phase 0 Complete, Phase 1 In Progress)  
> **Constraint Zero:** Pure JavaScript/JSX ONLY. Zero TypeScript source code. Zero ORMs. PostgreSQL authoritative.

---

## 1. Project Overview

Workaholic is a **personal productivity operating system** designed for high-context individuals (professionals, academics, and power users). It consolidates:

- **Task Management:** Hierarchical tasks, subtasks, task dependencies, priority, due dates, work blocks.
- **Projects & Kanban:** Customizable boards, columns, and workflow tracking.
- **Unified Calendar:** Multi-view native calendar, Google Calendar two-way synchronization, Day Order (DO) academic schedule generation with automatic holiday shift.
- **Today Command Center:** Daily focus cockpit summarizing current scheduled work, deadlines, and active priorities.
- **Notes & Knowledge:** Linked notes, checklists, and references.
- **Public Booking:** Self-service appointment scheduling with database-backed double-booking prevention.
- **Multi-Platform:** Web client (React/Vite), Windows Desktop (Electron), Android Mobile (Expo/React Native), with offline-first local replication (IndexedDB / SQLite).

---

## 2. System Architecture & Workspaces

The repository is structured as a standard `npm workspaces` monorepo:

```
workaholic/
├── apps/
│   ├── backend/          # Node.js + Fastify REST API service
│   │   ├── migrations/   # SQL migrations via node-pg-migrate
│   │   ├── src/          # Fastify app factory, db pool, modular domains
│   │   └── tests/        # Fastify inject() integration tests
│   ├── web/              # React 18 + Vite web client (pure JS/JSX)
│   │   ├── src/          # Layout, pages, routing, CSS design tokens
│   │   └── tests/        # DOM / Router component tests (Vitest + jsdom)
│   ├── desktop/          # Electron Windows desktop wrapper (pure JS)
│   │   └── src/          # main.js, preload.js (contextIsolation: true)
│   └── mobile/           # Expo / React Native Android shell (pure JS)
│       └── src/          # App.js, index.js, app.json
├── packages/
│   └── shared/           # @workaholic/shared: Constants, enums, Zod schemas
├── docker/               # docker-compose.yml, init-db.sql (Postgres 16)
├── scripts/              # check-js-only.js guard
├── docs/                 # Authoritative specifications (DO NOT REFORMAT OR OVERWRITE)
├── DESIGN.md             # Design system and UI/UX conventions
└── PROGRESS.md           # Living implementation state tracker
```

---

## 3. Strict Development Invariants

1. **JavaScript / JSX ONLY**:
   - Zero `.ts` or `.tsx` files.
   - Zero `tsc` or `ts-node`.
   - Never introduce TypeScript even if an external library commonly uses it.
   - Guard verified via `npm run check:js-only`.

2. **No Object-Relational Mappers (ORMs)**:
   - No Prisma, Drizzle, or TypeORM.
   - All database operations must use pure `pg` client with parameterized queries (`$1, $2, ...`).
   - Multi-step atomic mutations must use explicit ACID transactions (`withTransaction` in `db.js`).

3. **No Forbidden Infrastructure**:
   - Do NOT introduce Redis, Kafka, RabbitMQ, Kubernetes, microservices, Elasticsearch, Turborepo, Nx, or chat/LLM infrastructure.
   - PostgreSQL 16 is the single authoritative system of record. Background queues run on PostgreSQL (`FOR UPDATE SKIP LOCKED`).

4. **Maintain Documentation Integrity**:
   - Never silently alter documents in `docs/`.
   - If an architectural conflict arises, stop, report the trade-off, and await approval before modifying specifications.

5. **Living Progress Tracking**:
   - After completing each discrete task, update `PROGRESS.md` with: task status, files changed, verification commands executed, and any notes.

---

## 4. Coding & Data Layer Conventions

### 4.1 Backend (Fastify + pg)

- **Parameterized SQL**: Never interpolate dynamic values into query strings. Always pass parameters via array:
  ```javascript
  await client.query('SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
  ```
- **Transaction Support**: Repositories must accept an optional `client` parameter so that multiple repository calls can share an external transaction boundary:
  ```javascript
  export async function createUser(userData, client = pool) {
    return client.query(...);
  }
  ```
- **Standard API Envelope**: Responses must conform to `API-SPECIFICATION.md`:
  - Success: `{ "data": { ... } }` or `{ "data": [ ... ], "pagination": { ... } }`
  - Error:
    ```json
    {
      "error": {
        "code": "NOT_FOUND",
        "message": "Resource not found",
        "requestId": "UUID"
      }
    }
    ```
- **Fastify Testing**: Test route handlers using Fastify's native `app.inject()` without spinning up real external network sockets.

### 4.2 Shared (`@workaholic/shared`)

- Export cross-cutting constants (`TASK_STATUS`, `TASK_PRIORITY`, `ERROR_CODE`, `WORKSPACE_ROLE`).
- Export runtime Zod validation schemas (`idSchema`, `createTaskSchema`, `paginationQuerySchema`).
- Do NOT turn `packages/shared` into a dumping ground for application or UI logic.

### 4.3 Frontend (React + Vite)

- Functional components with React hooks.
- Semantic HTML and CSS variables (no Tailwind unless explicitly approved).
- State: Local component state or pure Context/Zustand if cross-cutting.
- Responsive breakpoints: Mobile (`<768px`), Tablet (`768px-1023px`), Desktop (`>=1024px`).
- Error Boundary: Always wrap root route outlets with an Error Boundary to prevent white-screens.

### 4.4 Desktop (Electron)

- Enforce `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Expose IPC methods exclusively through `contextBridge` in `preload.js` with strict channel whitelisting.

### 4.5 Mobile (React Native / Expo)

- Pure JavaScript components using standard React Native styles.
- React version pinned to `18.2.0` (matching `react-native@0.74.5` peer requirements).

---

## 5. Verification Protocol

Before declaring any implementation task complete, execute the full validation pipeline:

1. `npm run check:js-only`: Verifies zero TypeScript files exist.
2. `npm run lint`: Verifies ESLint 9 Flat Config passes with 0 errors and 0 warnings.
3. `npm run format:check`: Verifies code conforms to Prettier (docs are protected via `.prettierignore`).
4. `npm test`: Runs Vitest across all workspaces (`packages/shared`, `apps/backend`, `apps/web`).
5. `npm run build`: Verifies production compilation (`apps/web` Vite build).

---

## 6. Operational Skill Registry

Use the following globally available skills during development when their specific conditions are met. Do not invoke them indiscriminately.

### 6.1 Core Skills (Frequent Use)

| Skill                      | Trigger / Condition for Use                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@postgres-best-practices` | **Use when writing, optimizing, or reviewing PostgreSQL queries, indexing strategies, partial indexes, or locking.** Invoke specifically for complex queries, JSON operations, and `FOR UPDATE SKIP LOCKED` patterns. |
| `@postgresql`              | **Use when designing table schemas, selecting PostgreSQL data types, defining check constraints, foreign key cascades, or writing DDL migrations.** Ensures proper 3NF normalization and relational invariants.       |
| `@nodejs-backend-patterns` | **Use when structuring Fastify routes, controllers, middleware, or service-repository boundaries in `apps/backend`.** Guarantees modular, scalable Node.js patterns.                                                  |
| `@react-best-practices`    | **Use when creating or refactoring React components in `apps/web`.** Enforces Vercel's 45 optimization rules: waterfall elimination, bundle size reduction, re-render avoidance, and memory cleanup.                  |
| `@zod-validation-expert`   | **Use when creating or expanding Zod schemas in `packages/shared` or validating API payloads and query params.** Covers refinements (`.refine`), coercion, and custom error formatting.                               |
| `@vitest-skill`            | **Use when creating unit or integration tests for `shared`, `backend`, or `web`.** Provides patterns for `vi.mock`, assertions, fake timers, and async testing.                                                       |

### 6.2 Conditional Skills (Specific Task Scenarios)

| Skill                              | Trigger / Condition for Use                                                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@electron-development`            | **Use ONLY when working in `apps/desktop`.** Invoke for secure IPC channels, preload context bridges, window lifecycle, native menus, system tray, and packaging.                             |
| `@react-native-architecture`       | **Use ONLY when working in `apps/mobile`.** Invoke for Expo navigation patterns, native permissions, mobile offline SQLite, and Android battery/lifecycle management.                         |
| `@android-cli`                     | **Use ONLY when debugging Android emulator builds, SDK management, or running native APK tests via the command line.**                                                                        |
| `@frontend-design`                 | **Use when designing, implementing, or substantially redesigning user interfaces.** Ensures interfaces feel distinctive, polished, and purposeful, avoiding generic "AI template" aesthetics. |
| `@ui-ux-pro-max`                   | **Use when implementing design tokens, color scales, typography hierarchies, touch targets, and WCAG AA accessibility standards.**                                                            |
| `@docker-expert`                   | **Use when modifying `docker-compose.yml`, tuning PostgreSQL container settings, or configuring local development container persistence.**                                                    |
| `@playwright-skill`                | **Use when writing or executing End-to-End browser tests (Phase 30/31) verifying realistic user journeys across the web application.**                                                        |
| `@firebase`                        | **Use ONLY when implementing Firebase Authentication token verification or FCM push notification payloads.** Do NOT use for Firestore or database operations (PostgreSQL is authoritative).   |
| `@accidental-data-loss-prevention` | **CRITICAL: Use before executing any potentially destructive database command, migration rollback, or volume wipe.** STOP and verify with the user before any data loss.                      |

---

## 7. Execution Discipline

- Work **incrementally, task-by-task**. Never produce massive unverified multi-file diffs.
- Test every single task immediately upon implementation.
- If a verification check fails, fix it immediately before continuing.
- Stop and await approval at the end of each Phase before moving to the next.
