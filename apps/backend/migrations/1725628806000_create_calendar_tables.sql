-- Up Migration
-- Task 8.2: Calendar and Event Domain Database Foundation
-- Authoritative definitions matching DATABASE-DESIGN.md Sections 15, 16, & 17, CALENDAR-SPECIFICATION.md, and BUSINESS-RULES.md

-- 1. calendars table (Section 15)
CREATE TABLE IF NOT EXISTS calendars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  color VARCHAR(50) NOT NULL DEFAULT '#3B82F6',
  source_type VARCHAR(50) NOT NULL DEFAULT 'WORKAHOLIC',
  external_account_id VARCHAR(255) NULL,
  external_calendar_id VARCHAR(255) NULL,
  visibility VARCHAR(50) NOT NULL DEFAULT 'PRIVATE',
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_calendars_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT chk_calendars_visibility CHECK (visibility IN ('PRIVATE', 'SHARED', 'PUBLIC')),
  CONSTRAINT chk_calendars_source_type CHECK (source_type IN ('WORKAHOLIC', 'GOOGLE', 'COLLEGE', 'DAY_ORDER', 'HOLIDAY', 'BIRTHDAY', 'BOOKING', 'IMPORTED'))
);

CREATE INDEX IF NOT EXISTS idx_calendars_workspace ON calendars (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calendars_owner ON calendars (owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calendars_deleted_at ON calendars (deleted_at);

-- 2. events table (Section 16)
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location VARCHAR(500) NULL,
  meeting_url TEXT NULL,
  visibility VARCHAR(50) NOT NULL DEFAULT 'PRIVATE',
  status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED',
  source_type VARCHAR(50) NOT NULL DEFAULT 'WORKAHOLIC',
  source_reference VARCHAR(255) NULL,
  recurrence_rule_id UUID NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_events_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT chk_events_time_validity CHECK (end_at >= start_at),
  CONSTRAINT chk_events_visibility CHECK (visibility IN ('PRIVATE', 'SHARED', 'PUBLIC')),
  CONSTRAINT chk_events_status CHECK (status IN ('CONFIRMED', 'TENTATIVE', 'CANCELLED')),
  CONSTRAINT chk_events_source_type CHECK (source_type IN ('WORKAHOLIC', 'GOOGLE', 'COLLEGE', 'DAY_ORDER', 'HOLIDAY', 'BIRTHDAY', 'BOOKING', 'IMPORTED'))
);

CREATE INDEX IF NOT EXISTS idx_events_workspace ON events (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_calendar ON events (calendar_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_range ON events (start_at, end_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON events (deleted_at);
CREATE INDEX IF NOT EXISTS idx_events_search_title ON events USING gin (to_tsvector('english', title));

-- 3. event_tasks join table (Section 17.1)
CREATE TABLE IF NOT EXISTS event_tasks (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_event_tasks_task ON event_tasks (task_id);

-- 4. event_projects join table (Section 17.2)
CREATE TABLE IF NOT EXISTS event_projects (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_event_projects_project ON event_projects (project_id);

-- 5. Link task_work_blocks table to calendars (Section 14 & 15)
ALTER TABLE task_work_blocks
  ADD CONSTRAINT fk_task_work_blocks_calendar
  FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_work_blocks_calendar_id ON task_work_blocks (calendar_id);

-- Down Migration
DROP INDEX IF EXISTS idx_task_work_blocks_calendar_id;
ALTER TABLE task_work_blocks DROP CONSTRAINT IF EXISTS fk_task_work_blocks_calendar;
DROP TABLE IF EXISTS event_projects CASCADE;
DROP TABLE IF EXISTS event_tasks CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS calendars CASCADE;
