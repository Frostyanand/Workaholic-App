# `IMPLEMENTATION-PLAN.md`

**Status:** FINAL
**Purpose:** Define the complete implementation sequence for Workaholic from an empty repository to a production-ready multi-platform application.

This document is the implementation roadmap. It does not replace the functional, architectural, security, UX, database, synchronization, calendar, notification, or testing specifications already present in `docs/`.

---

# 1. Implementation Constitution

## 1.1 Primary Rule

Workaholic shall be implemented incrementally.

No phase may depend on undocumented assumptions when the authoritative project documentation already defines the required behavior.

Before implementing a feature, the implementing agent must inspect the relevant authoritative documentation.

---

## 1.2 Language Constraint

**TypeScript is prohibited.**

The project shall use:

* JavaScript
* JSX where required
* JSON
* SQL
* Markdown
* Platform-specific configuration/code where required

No `.ts` or `.tsx` source files shall be introduced.

No TypeScript compiler or TypeScript-specific build dependency shall be introduced unless a third-party framework absolutely requires it. If a proposed framework effectively requires TypeScript for normal operation, it shall not be selected without an explicit architectural decision.

JavaScript shall use appropriate linting and runtime validation to compensate for the absence of static TypeScript typing.

---

# 2. Authoritative Documentation Hierarchy

Implementation agents shall consult documentation in this conceptual order:

```text
PROJECT
   ↓
REQUIREMENTS
   ↓
DOMAIN MODEL
   ↓
BUSINESS RULES
   ↓
USER FLOWS
   ↓
SYSTEM ARCHITECTURE
   ↓
DATABASE DESIGN
   ↓
SPECIALIZED SPECIFICATIONS
   ↓
API / UX / DESIGN / TESTING
   ↓
IMPLEMENTATION
```

Specialized documents govern their respective domains.

Examples:

* Calendar behavior → `CALENDAR-SPECIFICATION.md`
* Sync behavior → `SYNC-SPECIFICATION.md`
* Notifications → `NOTIFICATION-SPECIFICATION.md`
* Permissions → `PERMISSIONS-MODEL.md`
* Offline behavior → `OFFLINE-PLATFORM-SPECIFICATION.md`

---

# 3. Progress Tracking

A root-level:

```text
PROGRESS.md
```

shall be maintained throughout development.

It is a **living implementation state**, not another specification.

After every implementation task, the agent shall update it with:

```text
Current Phase
Current Task
Status
Completed Work
Files Changed
Verification Performed
Tests Added/Modified
Known Issues
Important Implementation Notes
Deferred Items
Next Task
```

The tracker must always make it possible for a new agent to answer:

> What is already implemented, what is currently being worked on, what was verified, what remains, and what important details must not be forgotten?

---

# 4. Task Completion Contract

A task is not complete merely because the implementation appears to work.

Every task must pass the applicable verification layers.

```text
Implementation
      ↓
Lint
      ↓
Build
      ↓
Unit Tests
      ↓
Integration Tests
      ↓
Database Tests
      ↓
Security / Authorization Tests
      ↓
E2E / Manual Verification
      ↓
Documentation Consistency Check
      ↓
Progress Update
      ↓
COMPLETE
```

Not every task requires every layer, but the task must explicitly identify which layers apply.

---

# 5. Failure Rule

If verification fails:

```text
FAIL
 ↓
Diagnose
 ↓
Fix
 ↓
Re-run affected verification
 ↓
Check regression impact
 ↓
COMPLETE
```

A known lint/build/test failure shall not be carried forward simply because it is unrelated to the immediate feature.

---

# 6. Scope Control

The initial implementation includes:

* Web.
* Windows.
* Android.
* Tasks.
* Projects.
* Boards.
* Calendar.
* Recurring work.
* Notifications/reminders.
* Google Calendar.
* Google Tasks.
* Google Drive.
* Notes.
* Academic/Day Order scheduling.
* Public calendar.
* Booking.
* Trusted sharing.
* Collaboration.
* Offline support.
* Security.
* Observability.
* Deployment.

The initial implementation explicitly excludes:

* Chat.
* AI/NLP.
* Advanced intelligent scheduling.
* Large-scale distributed infrastructure.
* Premature microservices.
* Redis unless later justified.
* Kafka/RabbitMQ unless later justified.
* Kubernetes unless later justified.
* Dedicated search infrastructure unless later justified.

---

# 7. Phase 0: Repository and Technology Foundation

## Objective

Turn the currently empty/project repository into a clean, reproducible JavaScript development environment.

## Context

Before implementing application functionality, the repository must have:

* deterministic dependency management
* consistent scripts
* linting
* formatting
* testing
* environment management
* Git hygiene
* documented development commands

## Tasks

### 0.1 Inspect Repository

The agent must first inspect:

* Existing files.
* Existing `README.md`.
* `docs/`.
* Git status.
* Existing configuration.
* Existing package files.

No existing user-created work may be blindly overwritten.

### 0.2 Establish Workspace Structure

Create the agreed application workspace structure.

The exact framework/package arrangement shall follow `SYSTEM-ARCHITECTURE.md`.

The structure must permit:

* Web.
* Backend.
* Windows.
* Android.
* Shared JavaScript packages where appropriate.
* Database/migrations.
* Tests.

### 0.3 Package Management

Establish one reproducible package-management strategy.

All developers and CI must use the same package manager and lockfile.

### 0.4 JavaScript Enforcement

Add repository-level enforcement preventing accidental TypeScript introduction.

Examples:

* CI check for `.ts`/`.tsx`.
* ESLint configuration for JavaScript.
* Build scripts that do not invoke TypeScript.

### 0.5 Linting

Configure ESLint for:

* JavaScript.
* JSX where applicable.
* Import correctness.
* Unused variables.
* Suspicious patterns.
* Consistent code quality.

### 0.6 Formatting

Configure one formatter and make formatting deterministic.

### 0.7 Testing Foundation

Establish the test runner and baseline test command.

### 0.8 Environment Configuration

Create safe environment-variable handling.

No secrets may be committed.

### 0.9 Git Hygiene

Configure:

* `.gitignore`
* environment exclusions
* build output exclusions
* local database artifacts
* platform build artifacts

## Deliverables

* Reproducible repository.
* JavaScript-only enforcement.
* Working lint command.
* Working test command.
* Working build command.
* Clean Git state apart from intentional changes.
* Updated development instructions where necessary.

## Verification

```text
npm/pnpm install
lint
test
build
```

All must pass.

---

# 8. Phase 1: Application Skeleton

## Objective

Create the minimal runnable applications without implementing business functionality.

## Tasks

### 1.1 Web Application

Create the web application shell.

Requirements:

* responsive layout
* routing foundation
* error boundary strategy
* loading states
* basic accessibility
* authenticated/unauthenticated shell distinction

### 1.2 Backend Application

Create the modular backend structure.

Logical modules should be separated by domain.

### 1.3 Windows Foundation

Create the real Windows desktop application foundation.

Requirements:

* desktop process
* renderer/UI
* secure IPC boundary
* development startup
* production packaging foundation

No business functionality yet.

### 1.4 Android Foundation

Create the Android application foundation.

Requirements:

* application startup
* navigation foundation
* environment configuration
* API client foundation

### 1.5 Shared Code

Create only genuinely reusable shared code.

Examples:

* API contracts/constants.
* Validation schemas.
* Date utilities where platform-safe.
* Domain-independent utility functions.

Do not create a giant shared abstraction layer before it is needed.

## Verification

Each application must:

* launch
* compile/build
* pass lint
* pass baseline tests

---

# 9. Phase 2: Database Foundation

## Objective

Implement the database defined by `DATABASE-DESIGN.md`.

## Tasks

### 2.1 Database Connection

Create safe backend database connectivity.

### 2.2 Migration System

Establish migrations as the authoritative mechanism for schema changes.

No manual production schema modifications should become the normal workflow.

### 2.3 Core Tables

Implement foundational entities first:

* Users.
* Workspaces.
* Workspace memberships.
* Sessions/devices as defined.
* Base timestamps.
* IDs.
* Soft-delete fields where specified.

### 2.4 Domain Tables

Implement remaining domain tables according to the database specification.

Do not improvise schema fields when the specification already defines them.

### 2.5 Constraints

Implement database-level constraints wherever appropriate.

Examples:

* uniqueness
* foreign keys
* required fields
* valid relationships
* booking conflict protection where applicable

### 2.6 Indexes

Add indexes according to documented query patterns.

### 2.7 Seed/Development Data

Create deterministic development/test seed data.

Production data must never depend on development seeds.

## Verification

* Fresh database migration.
* Migration from empty state.
* Migration rollback strategy where supported.
* Seed.
* Constraint tests.
* Relationship tests.
* Index/query sanity checks.

---

# 10. Phase 3: Backend Foundation

## Objective

Establish the backend infrastructure on which all domain features will run.

## Tasks

### 3.1 Request Pipeline

Implement:

* request parsing
* validation
* error handling
* request IDs
* response conventions

### 3.2 Error Model

Create consistent application errors.

Differentiate:

* validation errors
* authentication errors
* authorization errors
* not-found errors
* conflict errors
* dependency errors
* internal errors

### 3.3 API Structure

Implement the API according to `API-SPECIFICATION.md`.

### 3.4 Authorization Boundary

Establish the central authorization mechanism before building sensitive resources.

### 3.5 Transaction Utilities

Establish safe database transaction patterns.

### 3.6 Background Job Foundation

Create the mechanism for managed background/scheduled work.

### 3.7 Observability

Implement the minimum observability foundation from `OBSERVABILITY.md`.

## Verification

Test:

* request validation
* malformed requests
* authentication failures
* authorization failures
* transaction rollback
* error serialization
* request correlation
* health endpoints

---

# 11. Phase 4: Authentication and Identity

## Objective

Implement secure user authentication and sessions.

## Tasks

### 4.1 Google Authentication

Implement Google sign-in.

Authentication must answer:

> Who is this user?

It must not automatically grant all Google API permissions.

### 4.2 Google API Authorization

Implement separate OAuth consent flows for:

* Calendar.
* Tasks.
* Drive.

Only request permissions actually required.

### 4.3 Sessions

Implement:

* session creation
* session validation
* expiration
* revocation
* logout

### 4.4 Device Registration

Implement device/session tracking.

### 4.5 Security Events

Record relevant authentication/security audit events.

### 4.6 Account Bootstrap

Create the minimum user/workspace state required after first authentication.

## Security Verification

Test:

* invalid sessions
* expired sessions
* revoked sessions
* unauthorized resource access
* OAuth callback tampering
* token leakage
* session fixation scenarios
* logout behavior
* multi-user isolation

---

# 12. Phase 5: Users, Workspaces, Memberships and Permissions

## Objective

Implement the multi-tenant authorization foundation.

## Tasks

### 5.1 Workspace

Create workspace lifecycle.

### 5.2 Membership

Implement membership creation/removal.

### 5.3 Roles

Implement defined roles.

### 5.4 Granular Permissions

Implement resource/action permissions according to `PERMISSIONS-MODEL.md`.

### 5.5 Ownership

Implement ownership rules.

### 5.6 Authorization Enforcement

Every protected API endpoint must perform server-side authorization.

Never rely only on UI hiding.

## Critical Verification

Create explicit negative tests:

```text
User A
  X
User B's workspace

Member
  X
Resource they cannot access

Viewer
  X
Mutation operation

Removed member
  X
Previously accessible resource
```

---

# 13. Phase 6: Core Task Engine

## Objective

Implement the fundamental Workaholic task system.

## Tasks

### 6.1 Task CRUD

Implement:

* create
* read
* update
* delete
* restore where applicable

### 6.2 Task Properties

Implement:

* title
* description
* status
* priority
* labels
* due date
* scheduling
* category/project relationships

### 6.3 Completion

Implement task completion and reopening.

### 6.4 Subtasks

Implement parent-child relationships.

### 6.5 Dependencies

Implement task dependencies according to business rules.

### 6.6 Recurrence Foundation

Implement recurring task definitions separately from generated occurrences where required.

### 6.7 Backlog and Overdue

Implement derived task states.

### 6.8 Search

Implement initial database-native task search.

## Verification

Test:

* CRUD.
* Validation.
* authorization.
* completion.
* reopening.
* subtasks.
* dependency edge cases.
* recurrence.
* overdue calculations.
* deleted/restored tasks.

---

# 14. Phase 7: Projects and Boards

## Objective

Implement project organization and Kanban workflows.

## Tasks

### 7.1 Projects

Implement:

* project CRUD
* project/task relationships
* project metadata

### 7.2 Boards

Implement:

* multiple boards
* board ownership/workspace
* custom columns

### 7.3 Kanban

Implement:

* task cards
* column movement
* drag/drop ordering
* persistence of ordering

### 7.4 Bulk Operations

Implement safe bulk updates.

### 7.5 Board Permissions

Apply workspace/project permissions.

## Verification

Test:

* cross-board movement.
* invalid board access.
* ordering consistency.
* concurrent updates.
* bulk authorization.
* deletion behavior.

---

# 15. Phase 8: Core Web UX

## Objective

Build the primary Workaholic web experience on top of stable domain APIs.

## Tasks

### 8.1 Design System

Implement the approved design system.

### 8.2 Navigation

Implement application navigation.

### 8.3 Task Views

Implement:

* list
* task detail
* Today
* overdue
* priority
* project

### 8.4 Board View

Implement Kanban.

### 8.5 Search

Implement global search foundation.

### 8.6 Command/Quick Actions

Implement only the agreed initial quick-action functionality.

### 8.7 Loading/Error/Empty States

Every major view must have all three.

## Verification

Check:

* desktop
* tablet
* mobile responsive layouts
* keyboard navigation
* focus handling
* accessibility
* loading/error states
* no console errors

---

# 16. Phase 9: Calendar Foundation

## Objective

Implement Workaholic's native calendar domain.

## Tasks

### 9.1 Calendar Model

Implement calendars and event relationships.

### 9.2 Native Events

Implement:

* title
* description
* start/end
* timezone
* recurrence
* visibility
* source/provenance

### 9.3 Calendar Views

Implement initially:

* day
* week
* workweek
* month
* agenda

Additional views may follow after the foundation is stable.

### 9.4 Event CRUD

Implement creation, editing, deletion, restoration where applicable.

### 9.5 Task Scheduling

Allow tasks to participate in calendar scheduling according to the specification.

### 9.6 Conflict Representation

Implement calendar conflict detection.

## Verification

Test:

* timezone boundaries
* midnight
* all-day events
* overlapping events
* recurring events
* deletion
* editing recurrence
* private/public visibility
* source metadata

---

# 17. Phase 10: Today / Command Center

## Objective

Build the central Workaholic daily workspace.

It should expose relevant:

* current work
* next scheduled item
* due today
* overdue
* important tasks
* calendar
* unscheduled work

## Verification

Verify correct ordering and filtering across:

* completed tasks
* overdue tasks
* recurring tasks
* calendar events
* timezone boundaries
* priorities
* permissions

---

# 18. Phase 11: Recurring Tasks and Events

## Objective

Build reliable recurrence processing.

## Tasks

* recurrence definitions
* occurrence calculation
* exceptions
* skipped occurrences
* edited occurrences
* completion state
* future generation
* background generation

## Verification

Test:

* daily
* weekly
* monthly
* yearly
* weekday patterns
* end dates
* infinite recurrence
* DST/timezone changes
* edited occurrences
* deleted occurrences

---

# 19. Phase 12: Notification and Reminder Engine

## Objective

Implement reliable reminders.

## Tasks

### 12.1 Reminder Model

Implement reminder definitions.

### 12.2 Trigger Rules

Support:

* exact time
* relative-to-event
* relative-to-deadline
* recurring reminders

### 12.3 Snooze

Implement:

* fixed intervals
* custom time

### 12.4 Delivery

Implement server/client notification pathways.

### 12.5 Delivery Tracking

Track:

* scheduled
* attempted
* delivered
* failed
* retried
* dismissed/snoozed

### 12.6 Important Shared Reminders

Implement explicit recipient targeting.

Recipients must independently control their reminder state.

## Verification

Test:

* missed execution.
* duplicate delivery prevention.
* timezone changes.
* snooze.
* recurrence.
* revoked device.
* offline device.
* multiple recipients.
* owner vs recipient state.

---

# 20. Phase 13: Google Calendar Integration

## Objective

Implement two-way Calendar synchronization.

## Tasks

### 13.1 OAuth Permission

Calendar-specific authorization.

### 13.2 Calendar Discovery

Import available calendars.

### 13.3 Mapping

Map:

```text
Native Calendar ↔ External Calendar
Native Event ↔ External Event
```

### 13.4 Initial Sync

Implement first synchronization.

### 13.5 Incremental Sync

Implement provider-supported incremental synchronization.

### 13.6 Outbound Changes

Synchronize Workaholic changes to Google.

### 13.7 Inbound Changes

Synchronize Google changes to Workaholic.

### 13.8 Deletion Semantics

Implement exactly according to `SYNC-SPECIFICATION.md`.

### 13.9 Conflict Handling

Implement deterministic conflict resolution.

### 13.10 Sync Recovery

Support failed/invalid sync states.

## Critical Verification

Test:

* duplicate prevention.
* external deletion.
* native deletion.
* simultaneous edits.
* token expiration.
* revoked permission.
* provider errors.
* repeated synchronization.
* partial failures.
* pagination.
* incremental cursor invalidation.

---

# 21. Phase 14: Google Tasks Integration

## Objective

Implement Google Tasks synchronization.

Follow the same controlled model as Calendar:

```text
Authorization
 ↓
Discovery
 ↓
Mapping
 ↓
Initial Sync
 ↓
Incremental Sync
 ↓
Outbound Changes
 ↓
Inbound Changes
 ↓
Conflict Handling
 ↓
Recovery
```

## Verification

Test task creation, editing, completion, deletion, restoration where supported, repeated sync, external changes, and authorization failures.

---

# 22. Phase 15: Google Drive Integration

## Objective

Implement Drive-backed attachments.

## Tasks

* Drive authorization.
* Drive file selection/upload.
* Attachment metadata.
* Resource-to-file relationships.
* Permission handling.
* Detach semantics.
* Explicit Drive deletion.

## Critical Rule

Detaching:

```text
Task ←→ Drive File
```

must not silently delete:

```text
Drive File
```

## Verification

Test:

* missing file.
* permission revoked.
* file moved.
* file deleted externally.
* duplicate attachment.
* detach.
* explicit deletion.
* unauthorized access.

---

# 23. Phase 16: Synchronization Hardening

## Objective

Make synchronization reliable enough for production.

## Tasks

Implement:

* sync state machine
* retries
* idempotency
* conflict handling
* external identifier mapping
* provider error classification
* recovery/resync
* sync diagnostics

## Verification

Run repeated synchronization against unchanged data.

Expected result:

```text
First sync:
Changes applied

Second sync:
No duplicate changes

Third sync:
No duplicate changes
```

Then test conflicting changes and recovery.

---

# 24. Phase 17: Notes

## Objective

Implement the central Notes workspace.

## Tasks

* note CRUD
* rich text
* headings
* lists
* checklists
* links
* images
* attachments
* code blocks
* tables
* tags
* search
* pin/favorite
* archive
* backlinks
* task/project/event relationships

## Important Rule

A note checklist item is **not automatically a Workaholic task**.

Explicit conversion must be used.

## Verification

Test content persistence, malformed content, relationships, permissions, deletion/recovery, search, and attachment behavior.

---

# 25. Phase 18: Academic Calendar and Day Order Engine

## Objective

Implement the complete college scheduling subsystem.

This phase should be treated as one of the most carefully tested domain areas.

## Tasks

### 18.1 Semester

Implement semester lifecycle.

### 18.2 Academic Calendar

Implement:

* working days
* holidays
* special working days
* cancellations
* rescheduled classes

### 18.3 Day Order Sequence

Implement DO progression.

### 18.4 Schedule Templates

Create reusable class schedule mappings.

### 18.5 Class Entries

Map classes to:

* day order
* time
* course
* location
* relevant metadata

### 18.6 Event Generation

Generate calendar occurrences from the academic schedule.

### 18.7 Holiday Shifting

When a holiday changes the academic working-day sequence:

```text
Holiday
 ↓
Working-day sequence changes
 ↓
DO assignment changes
 ↓
DO-linked class occurrence shifts
```

### 18.8 Working Saturday

Explicitly support working Saturdays.

### 18.9 Semester End

`End Semester` must:

* invalidate/remove future occurrences generated by that semester's schedule
* preserve historical occurrences
* preserve reusable schedule mappings
* preserve relevant academic configuration

It must not indiscriminately delete unrelated calendar events.

## Verification

Construct complete scenario tests:

1. Normal semester.
2. Holiday before a DO.
3. Multiple holidays.
4. Working Saturday.
5. Cancelled class.
6. Rescheduled class.
7. Semester ending.
8. New semester.
9. Personal event existing alongside academic events.
10. Re-running generation without duplicates.

---

# 26. Phase 19: Public Calendar

## Objective

Allow controlled public availability viewing.

## Tasks

* public calendar configuration
* public link generation
* public link revocation
* regeneration
* visibility rules
* busy/private representation
* public event representation
* unauthenticated access

## Verification

Attempt public access to:

* public event
* private event
* mixed calendar
* revoked link
* regenerated link
* nonexistent token

Ensure private metadata never leaks.

---

# 27. Phase 20: Booking System

## Objective

Implement guest booking without requiring a Workaholic account.

## Tasks

### 20.1 Booking Configuration

Implement:

* availability windows
* duration
* buffer
* minimum notice
* maximum booking horizon
* cancellation deadline
* timezone

### 20.2 Availability Calculation

Account for existing busy periods.

### 20.3 Booking

Implement transactional booking.

### 20.4 Confirmation

Create appropriate calendar state.

### 20.5 Cancellation

Implement cancellation.

### 20.6 Rescheduling

Implement safe rescheduling.

### 20.7 Notifications

Send relevant confirmations/reminders.

## Critical Verification

Simulate simultaneous booking attempts for the same slot.

Expected:

```text
Request A → SUCCESS
Request B → CONFLICT
```

Never:

```text
Request A → SUCCESS
Request B → SUCCESS
```

for the same exclusive slot.

---

# 28. Phase 21: Trusted Sharing and Collaboration

## Objective

Implement controlled sharing between Workaholic users.

## Tasks

### 21.1 Share Code

Implement onboarding code flow.

The code is an onboarding mechanism, not a permanent credential.

### 21.2 Trusted Relationship

Create authenticated relationships between accounts.

### 21.3 Permissions

Implement granular permissions.

### 21.4 Trusted Devices

Implement persistent trusted-device behavior.

### 21.5 Public Sessions

Implement configurable expiration.

### 21.6 Remote Revocation

Support:

* individual session termination
* all-session termination

### 21.7 Shared Reminders

Allow explicit recipients.

Recipients maintain independent reminder state.

### 21.8 Collaboration

Implement:

* assignment
* comments
* mentions
* activity
* attachments
* notifications

## Verification

Test every permission boundary using separate users.

---

# 29. Phase 22: Offline Synchronization Foundation

## Objective

Make the application resilient to connectivity loss.

## Tasks

* local state
* local persistence
* operation queue
* sync state
* retry
* conflict handling
* reconciliation
* offline indicators

## Verification

Test:

```text
Online
 ↓
Disconnect
 ↓
Create task
 ↓
Edit task
 ↓
Reconnect
 ↓
Synchronize
```

Then test:

* conflicting server/client edits
* duplicate operations
* failed network requests
* app restart while offline
* queue recovery
* authentication expiry while offline

---

# 30. Phase 23: Windows Application

## Objective

Turn the Windows foundation into a useful native desktop productivity client.

## Tasks

### 23.1 Desktop Shell

Implement final application shell.

### 23.2 Authentication

Secure authentication/session handling.

### 23.3 Sync

Implement background synchronization.

### 23.4 Tray

Implement:

* system tray
* close-to-tray behavior where specified
* startup option

### 23.5 Local Reminders

Implement local scheduling.

### 23.6 Desktop Notifications

Implement notifications/alarm behavior.

### 23.7 Offline Support

Integrate local state and synchronization.

### 23.8 Auto Update

Implement safe update mechanism.

### 23.9 Resource Usage

Measure:

* CPU
* RAM
* startup time
* background behavior

## Verification

Test:

* startup
* sleep/wake
* network loss
* notification
* tray behavior
* logout
* update
* crash recovery

---

# 31. Phase 24: Android Application

## Objective

Implement the Android productivity client.

## Tasks

* authentication
* task UI
* calendar UI
* Today view
* notifications
* local alarms
* offline persistence
* background synchronization
* permission handling

## Verification

Test:

* offline mode
* background restrictions
* notification permission denied
* battery optimization
* timezone changes
* app restart
* sync recovery
* account logout

---

# 32. Phase 25: Web Offline/PWA Behavior

## Objective

Complete appropriate offline web functionality.

## Tasks

* service worker where applicable
* cache strategy
* offline state
* local pending operations
* reconnect synchronization

The web client must not cache private data in a way that violates security expectations.

## Verification

Test:

* offline startup where supported
* stale data
* reconnect
* cache invalidation
* logout
* multiple accounts on same browser

---

# 33. Phase 26: Global Search

## Objective

Expand search across supported Workaholic resources.

Search targets eventually include:

* Tasks.
* Projects.
* Boards.
* Events.
* Notes.
* People.
* Files.
* Other supported resources.

The implementation should initially remain database-native.

## Verification

Test:

* permissions filtering.
* deleted resources.
* partial terms.
* exact terms.
* multiple resource types.
* pagination.
* ranking consistency.

---

# 34. Phase 27: Security Hardening

## Objective

Perform a dedicated security pass after the major application surfaces exist.

## Tasks

### Authentication

* session security
* OAuth security
* logout/revocation

### Authorization

* workspace isolation
* object-level authorization
* role boundaries
* public endpoint boundaries

### Input

* validation
* injection protection
* malicious payloads
* file validation

### Files

* content handling
* permissions
* external file access

### Sessions

* expiry
* revocation
* device management

### APIs

* rate limiting
* abuse prevention
* error leakage

### Privacy

* logs
* telemetry
* public calendar
* notes
* attachments

## Verification

Run security-focused negative tests across every major API domain.

---

# 35. Phase 28: Observability Completion

## Objective

Ensure production behavior can be diagnosed without exposing private information.

## Tasks

* structured logs
* metrics
* error reporting
* synchronization diagnostics
* reminder diagnostics
* booking diagnostics
* security events
* deployment correlation
* client crash reporting

## Verification

Intentionally trigger representative failures and confirm they can be diagnosed without sensitive content appearing in telemetry.

---

# 36. Phase 29: Performance Hardening

## Objective

Optimize based on actual behavior rather than hypothetical scale.

## Tasks

Measure:

* API latency.
* database queries.
* page loading.
* bundle size.
* calendar rendering.
* large task lists.
* search.
* synchronization.
* background processing.
* mobile performance.
* Windows resource usage.

Then optimize actual bottlenecks.

Do not introduce Redis, Kafka, specialized search, or other infrastructure simply because performance work exists.

---

# 37. Phase 30: Comprehensive Testing

## Objective

Bring the entire test suite to release quality.

Testing shall align with:

* `TESTING-STRATEGY.md`
* `TEST-MATRIX.md`

## Test Layers

### Unit

Domain logic and pure functions.

### Database

Constraints, transactions, isolation.

### Integration

Module interactions.

### API

Request/response behavior.

### Authorization

Positive and negative permission cases.

### Synchronization

Provider interactions and conflict behavior.

### E2E

Real user workflows.

### Platform

Web, Windows, Android.

### Regression

Every significant discovered bug receives a regression test where practical.

---

# 38. Phase 31: End-to-End Critical User Journeys

The following journeys must work from beginning to end.

## Journey A: First User

```text
Open Workaholic
 ↓
Google Login
 ↓
Create/initialize workspace
 ↓
Create task
 ↓
Complete task
```

## Journey B: Scheduled Work

```text
Create task
 ↓
Schedule task
 ↓
Calendar
 ↓
Reminder
 ↓
Notification
 ↓
Complete task
```

## Journey C: Google Calendar

```text
Authorize Google Calendar
 ↓
Import
 ↓
Modify in Workaholic
 ↓
Google updated
 ↓
Modify in Google
 ↓
Workaholic updated
```

## Journey D: Offline

```text
Go offline
 ↓
Create task
 ↓
Modify task
 ↓
Reconnect
 ↓
Sync
 ↓
Verify server state
```

## Journey E: Academic Schedule

```text
Create semester
 ↓
Configure academic calendar
 ↓
Configure DO
 ↓
Map class schedule
 ↓
Generate classes
 ↓
Add holiday
 ↓
Verify DO shift
 ↓
End semester
 ↓
Verify future academic events removed
 ↓
Verify history preserved
```

## Journey F: Booking

```text
Public booking page
 ↓
Select available slot
 ↓
Submit
 ↓
Booking created
 ↓
Calendar updated
 ↓
Notification sent
```

## Journey G: Trusted User

```text
Owner generates onboarding code
 ↓
Trusted user authenticates
 ↓
Relationship established
 ↓
Permission checked
 ↓
Shared resource accessed
 ↓
Owner revokes access
 ↓
Access denied
```

---

# 39. Phase 32: Production Infrastructure

## Objective

Deploy the system according to `DEPLOYMENT.md`.

## Tasks

* production database
* backend deployment
* Vercel web deployment
* domain
* environment variables
* OAuth production configuration
* Google APIs
* background jobs
* notification infrastructure
* monitoring
* backups
* recovery procedures

---

# 40. Phase 33: CI/CD

## Objective

Prevent broken code from reaching production.

The CI pipeline should perform the relevant:

```text
Install
 ↓
Lint
 ↓
Unit Tests
 ↓
Integration Tests
 ↓
Build
 ↓
E2E where environment permits
 ↓
Security checks
 ↓
Deployment
```

Deployment should fail if mandatory checks fail.

---

# 41. Phase 34: Backup and Recovery Verification

## Objective

Ensure data can actually be recovered.

Test:

* database backup creation
* backup integrity
* restoration
* migration compatibility
* recovery procedure
* accidental deletion recovery
* external integration recovery

A backup that has never been successfully restored is not considered fully verified.

---

# 42. Phase 35: Release Candidate

## Objective

Create a production candidate and freeze feature development.

## Requirements

All of the following must be true:

* No known blocking bugs.
* No lint failures.
* No build failures.
* No failing mandatory tests.
* Authentication works.
* Authorization works.
* Database migrations work.
* Sync works.
* Reminders work.
* Offline behavior works.
* Public access is secure.
* Booking concurrency is correct.
* Windows builds.
* Android builds.
* Web builds.
* Production configuration is verified.

---

# 43. Phase 36: Final Release Audit

Perform a final review against:

```text
PROJECT.md
REQUIREMENTS.md
DOMAIN-MODEL.md
BUSINESS-RULES.md
USER-FLOWS.md
SYSTEM-ARCHITECTURE.md
DATABASE-DESIGN.md
SYNC-SPECIFICATION.md
CALENDAR-SPECIFICATION.md
NOTIFICATION-SPECIFICATION.md
PERMISSIONS-MODEL.md
PRIVACY-SECURITY.md
UX-SPECIFICATION.md
DESIGN-SYSTEM.md
API-SPECIFICATION.md
TESTING-STRATEGY.md
TEST-MATRIX.md
DEPLOYMENT.md
INTEGRATION-SPECIFICATION.md
OFFLINE-PLATFORM-SPECIFICATION.md
OBSERVABILITY.md
COST-ARCHITECTURE.md
ARCHITECTURE-DECISIONS.md
```

The review should identify:

* Missing requirements.
* Contradictory behavior.
* Broken workflows.
* Security gaps.
* Platform inconsistencies.
* Unhandled error states.
* Missing tests.
* Documentation drift.

---

# 44. Cross-Phase Engineering Rules

These rules apply to **every phase**.

## Rule 1: Read Before Editing

Before modifying an existing module, inspect:

* its implementation
* tests
* related API
* related database model
* relevant documentation

Do not overwrite functionality blindly.

---

## Rule 2: Small Changes

Prefer:

```text
small implementation
→ test
→ verify
→ next implementation
```

over:

```text
large implementation
→ everything breaks
→ debugging marathon
```

---

## Rule 3: Database Changes First

When a feature requires a schema change:

```text
Domain decision
 ↓
Migration
 ↓
Database tests
 ↓
Backend
 ↓
API
 ↓
UI
```

Do not make UI assumptions about fields that do not exist in the authoritative database model.

---

## Rule 4: Backend Authorization Always

Every protected mutation and protected read must enforce authorization server-side.

UI-level hiding is never considered authorization.

---

## Rule 5: Validate at Boundaries

Validate:

* API input.
* External provider data.
* File metadata.
* Query parameters.
* Path parameters.
* Client synchronization operations.

Do not trust external input merely because it originated from another Workaholic client.

---

## Rule 6: Idempotency

Operations that may be retried must be designed to avoid accidental duplication.

Especially:

* synchronization
* notifications
* recurring generation
* booking
* background jobs
* offline operation replay

---

## Rule 7: Timezone Awareness

Any functionality involving dates/times must explicitly consider:

* user timezone
* event timezone
* daylight-saving transitions where applicable
* all-day events
* recurring events
* midnight boundaries

Do not casually use local machine time as authoritative application time.

---

## Rule 8: External IDs Are Not Native IDs

Google identifiers and other provider identifiers must remain separate from Workaholic identifiers.

---

## Rule 9: Do Not Delete More Than Intended

Every destructive operation must explicitly define its scope.

Especially:

* semester ending
* calendar deletion
* attachment removal
* workspace deletion
* external resource deletion
* recurring event deletion

---

## Rule 10: Errors Are Product Behavior

Every major feature must define:

```text
Success
Loading
Empty
Validation Error
Permission Error
Not Found
Conflict
Network Error
Server Error
```

where applicable.

---

# 45. Definition of Done

A feature/task is complete only when:

### Functional

* Requirement implemented.
* Business rules implemented.
* User flow works.

### Technical

* Code integrated cleanly.
* No dead imports.
* No obvious dead code.
* No lint errors.
* No build errors.

### Testing

* Relevant tests exist.
* Tests pass.
* Important negative cases are covered.
* Regression tests added for discovered bugs.

### Security

* Authorization enforced.
* Input validated.
* Sensitive information protected.

### UX

* Loading state.
* Empty state.
* Error state.
* Responsive behavior.
* Accessibility considerations.

### Operational

* Errors observable.
* Important operations diagnosable.
* Background work observable.

### Documentation

* Relevant documentation remains accurate.
* `PROGRESS.md` updated.

---

# 46. Bug Prevention Strategy

The implementation process shall prioritize **preventing classes of bugs**, not merely fixing individual symptoms.

For every discovered bug, ask:

```text
Why did this happen?
        ↓
Could the type of bug happen elsewhere?
        ↓
Can a shared invariant prevent it?
        ↓
Can a test detect it?
        ↓
Can tooling prevent it?
```

For example:

```text
One unauthorized endpoint
        ↓
Check every endpoint in that module
        ↓
Check authorization middleware
        ↓
Add authorization test helper
        ↓
Add negative test cases
```

---

# 47. Progress Tracker Protocol

After every task, `PROGRESS.md` shall be updated.

A completed task should record:

```markdown
## Current State

Phase: X
Task: X.Y
Status: COMPLETE

## Completed

- ...

## Files Changed

- ...

## Verification

- [x] Lint
- [x] Build
- [x] Unit tests
- [x] Integration tests
- [x] Manual verification

## Issues

None.

## Important Notes

- ...

## Deferred

- ...

## Next

Phase X, Task X.Y+1
```

For incomplete work:

```markdown
Status: IN PROGRESS
```

For blocked work:

```markdown
Status: BLOCKED
```

The reason must be explicitly recorded.

---

# 48. Future Implementation Notes

`PROGRESS.md` may contain a section for important information that does not belong in the permanent architecture documentation.

Examples:

```text
IMPORTANT FUTURE NOTES

- Provider X currently has behavior that requires special handling.
- Android background execution requires additional verification.
- This component intentionally uses a temporary implementation.
- Revisit this optimization after production usage.
```

Such notes must not silently override authoritative specifications.

If a temporary implementation becomes a permanent architectural decision, the relevant authoritative document must eventually be updated.

---

# 49. Phase Completion Gate

A phase cannot be marked complete merely because its feature list has been implemented.

Before moving to the next phase:

```text
Feature implementation
        ↓
Tests
        ↓
Integration verification
        ↓
Regression suite
        ↓
Security review
        ↓
Build verification
        ↓
Documentation consistency
        ↓
Progress tracker update
        ↓
PHASE COMPLETE
```

The next phase should not begin if a blocking defect from the current phase remains unresolved.

---

# 50. Implementation Order Summary

The complete implementation sequence is:

```text
00  Repository / Tooling
 ↓
01  Application Skeleton
 ↓
02  Database Foundation
 ↓
03  Backend Foundation
 ↓
04  Authentication
 ↓
05  Users / Workspaces / Permissions
 ↓
06  Tasks
 ↓
07  Projects / Boards
 ↓
08  Core Web UX
 ↓
09  Calendar
 ↓
10  Today / Command Center
 ↓
11  Recurrence
 ↓
12  Notifications / Reminders
 ↓
13  Google Calendar
 ↓
14  Google Tasks
 ↓
15  Google Drive
 ↓
16  Sync Hardening
 ↓
17  Notes
 ↓
18  Academic / Day Order
 ↓
19  Public Calendar
 ↓
20  Booking
 ↓
21  Trusted Sharing / Collaboration
 ↓
22  Offline
 ↓
23  Windows
 ↓
24  Android
 ↓
25  Web Offline/PWA
 ↓
26  Global Search
 ↓
27  Security Hardening
 ↓
28  Observability
 ↓
29  Performance
 ↓
30  Comprehensive Testing
 ↓
31  Critical E2E Journeys
 ↓
32  Production Infrastructure
 ↓
33  CI/CD
 ↓
34  Backup / Recovery
 ↓
35  Release Candidate
 ↓
36  Final Audit
 ↓
                 WORKAHOLIC v1
```

---

# 51. Important Sequencing Clarification

The numbered phases represent **logical dependency stages**, not necessarily one giant Antigravity prompt per phase.

For example:

```text
Phase 6: Tasks
```

will itself become:

```text
6.1 Task database verification
6.2 Task repository/data access
6.3 Task service
6.4 Task API
6.5 Task validation
6.6 Task authorization
6.7 Task UI
6.8 Task completion
6.9 Task tests
6.10 Task integration verification
```

The exact task decomposition will be determined when entering that phase.

This keeps individual changes small enough to understand and verify.

---

# 52. Agent Operating Procedure

Whenever an implementation task is assigned to an AI coding agent, the agent shall:

### Before coding

1. Read `PROGRESS.md`.
2. Identify the current phase/task.
3. Read the relevant authoritative documentation.
4. Inspect the existing implementation.
5. Identify dependencies.
6. State what it intends to change.

### During coding

1. Make only the required changes.
2. Preserve existing behavior.
3. Add/update tests.
4. Avoid unrelated refactoring.
5. Avoid introducing new infrastructure without justification.

### After coding

1. Run lint.
2. Run relevant tests.
3. Run build.
4. Run applicable integration/E2E checks.
5. Inspect changed files.
6. Check for accidental TypeScript.
7. Check for security/authorization implications.
8. Update `PROGRESS.md`.
9. Report exactly what was completed and verified.

Then stop.

---

# 53. Agent Context Recovery

A new agent/chat should be able to recover project state using:

```text
1. README.md
2. PROGRESS.md
3. docs/IMPLEMENTATION-PLAN.md
4. relevant docs/*
5. source code
6. tests
```

The agent must **not assume previous conversational context exists**.

The repository is the persistent source of implementation state.

---

# 54. Final Implementation Principle

Workaholic will be built using:

```text
                 Requirements
                      ↓
                Architecture
                      ↓
                 Small Task
                      ↓
                 Implementation
                      ↓
                    Tests
                      ↓
                  Verification
                      ↓
               Progress Update
                      ↓
                 Next Task
```

rather than:

```text
Requirements
     ↓
"Build the whole application"
     ↓
Thousands of lines
     ↓
Debugging archaeology
```

The objective is not to maximize implementation speed at the beginning.

The objective is to reach a **correct, maintainable, secure, testable product with minimal accumulated debugging debt**.

---
