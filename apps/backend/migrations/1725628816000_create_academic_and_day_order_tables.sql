-- Up Migration
-- Phase 18: Academic Calendar and Day Order Engine Database Foundation
-- Authoritative schema matching CALENDAR-SPECIFICATION.md, DATABASE-DESIGN.md, and BUSINESS-RULES.md (BR-DO-001 through BR-DO-016)

-- 1. semesters table
CREATE TABLE IF NOT EXISTS semesters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  calendar_id UUID NULL REFERENCES calendars(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  academic_year VARCHAR(50) NULL,
  institution VARCHAR(255) NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  day_order_count INTEGER NOT NULL DEFAULT 5,
  status VARCHAR(50) NOT NULL DEFAULT 'UPCOMING',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_semesters_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT chk_semesters_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_semesters_status CHECK (status IN ('UPCOMING', 'ACTIVE', 'ENDED')),
  CONSTRAINT chk_semesters_day_order_count CHECK (day_order_count >= 1 AND day_order_count <= 10)
);

CREATE INDEX IF NOT EXISTS idx_semesters_workspace ON semesters (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_semesters_status ON semesters (workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_semesters_deleted_at ON semesters (deleted_at);

-- 2. academic_calendar_dates table
CREATE TABLE IF NOT EXISTS academic_calendar_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  calendar_date DATE NOT NULL,
  day_status VARCHAR(50) NOT NULL DEFAULT 'WORKING_DAY',
  reason TEXT NULL,
  day_order VARCHAR(10) NULL,
  override_day_order VARCHAR(10) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_acad_cal_day_status CHECK (day_status IN ('WORKING_DAY', 'HOLIDAY', 'SPECIAL_WORKING_DAY', 'OTHER_NON_WORKING_DAY')),
  CONSTRAINT uq_academic_calendar_dates_sem_date UNIQUE (semester_id, calendar_date)
);

CREATE INDEX IF NOT EXISTS idx_acad_cal_dates_semester ON academic_calendar_dates (semester_id, calendar_date);
CREATE INDEX IF NOT EXISTS idx_acad_cal_dates_day_order ON academic_calendar_dates (semester_id, day_order) WHERE day_order IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acad_cal_dates_workspace ON academic_calendar_dates (workspace_id);

-- 3. class_schedules table (reusable schedule templates)
CREATE TABLE IF NOT EXISTS class_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  semester_id UUID NULL REFERENCES semesters(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_class_schedules_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_class_schedules_workspace ON class_schedules (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_class_schedules_semester ON class_schedules (semester_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_class_schedules_deleted_at ON class_schedules (deleted_at);

-- 4. schedule_entries table (individual class definitions within reusable template)
CREATE TABLE IF NOT EXISTS schedule_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_schedule_id UUID NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  day_order VARCHAR(10) NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  course_code VARCHAR(50) NULL,
  instructor VARCHAR(255) NULL,
  room VARCHAR(100) NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  color VARCHAR(50) NOT NULL DEFAULT '#6366F1',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_sched_entries_course_not_empty CHECK (length(trim(course_name)) > 0),
  CONSTRAINT chk_sched_entries_time CHECK (end_time > start_time),
  CONSTRAINT chk_sched_entries_day_order CHECK (day_order IN ('DO1', 'DO2', 'DO3', 'DO4', 'DO5', 'DO6', 'DO7', 'DO8', 'DO9', 'DO10'))
);

CREATE INDEX IF NOT EXISTS idx_sched_entries_schedule_do ON schedule_entries (class_schedule_id, day_order);
CREATE INDEX IF NOT EXISTS idx_sched_entries_workspace ON schedule_entries (workspace_id);

-- 5. academic_exceptions table (cancelled or rescheduled class occurrences)
CREATE TABLE IF NOT EXISTS academic_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  schedule_entry_id UUID NOT NULL REFERENCES schedule_entries(id) ON DELETE CASCADE,
  calendar_date DATE NOT NULL,
  exception_type VARCHAR(50) NOT NULL,
  reason TEXT NULL,
  rescheduled_date DATE NULL,
  rescheduled_start_time TIME NULL,
  rescheduled_end_time TIME NULL,
  rescheduled_room VARCHAR(100) NULL,
  event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_acad_exceptions_type CHECK (exception_type IN ('CANCELLED', 'RESCHEDULED', 'EXTRA_CLASS')),
  CONSTRAINT uq_academic_exceptions_occurrence UNIQUE (semester_id, schedule_entry_id, calendar_date)
);

CREATE INDEX IF NOT EXISTS idx_acad_exceptions_semester ON academic_exceptions (semester_id, calendar_date);
CREATE INDEX IF NOT EXISTS idx_acad_exceptions_entry ON academic_exceptions (schedule_entry_id);

-- 6. Add academic provenance columns to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS semester_id UUID NULL REFERENCES semesters(id) ON DELETE CASCADE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS class_schedule_id UUID NULL REFERENCES class_schedules(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS schedule_entry_id UUID NULL REFERENCES schedule_entries(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS day_order VARCHAR(10) NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS academic_date DATE NULL;

CREATE INDEX IF NOT EXISTS idx_events_semester_id ON events (semester_id) WHERE semester_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_academic_date ON events (academic_date) WHERE academic_date IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_academic_idempotent ON events (semester_id, schedule_entry_id, academic_date)
  WHERE semester_id IS NOT NULL AND schedule_entry_id IS NOT NULL AND deleted_at IS NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_events_academic_idempotent;
DROP INDEX IF EXISTS idx_events_academic_date;
DROP INDEX IF EXISTS idx_events_semester_id;
ALTER TABLE events DROP COLUMN IF EXISTS academic_date;
ALTER TABLE events DROP COLUMN IF EXISTS day_order;
ALTER TABLE events DROP COLUMN IF EXISTS schedule_entry_id;
ALTER TABLE events DROP COLUMN IF EXISTS class_schedule_id;
ALTER TABLE events DROP COLUMN IF EXISTS semester_id;

DROP TABLE IF EXISTS academic_exceptions CASCADE;
DROP TABLE IF EXISTS schedule_entries CASCADE;
DROP TABLE IF EXISTS class_schedules CASCADE;
DROP TABLE IF EXISTS academic_calendar_dates CASCADE;
DROP TABLE IF EXISTS semesters CASCADE;
