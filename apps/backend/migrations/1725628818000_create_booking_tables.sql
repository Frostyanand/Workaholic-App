-- Up Migration
-- Phase 20: Booking & Availability Engine
-- Conforms to DATABASE-DESIGN.md Section 34-36, 55, BUSINESS-RULES.md Section 19, and CALENDAR-SPECIFICATION.md Section 44-45

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Expand tasks source_type check constraint to permit BOOKING
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_source_type;
ALTER TABLE tasks ADD CONSTRAINT chk_tasks_source_type
  CHECK (source_type IN ('WORKAHOLIC', 'GOOGLE', 'IMPORTED', 'BOOKING'));

-- 1. Booking Pages
CREATE TABLE IF NOT EXISTS booking_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  calendar_id UUID REFERENCES calendars(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_booking_pages_status CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE INDEX IF NOT EXISTS idx_booking_pages_workspace ON booking_pages (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_booking_pages_owner ON booking_pages (owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_booking_pages_slug ON booking_pages (slug) WHERE deleted_at IS NULL;

-- 2. Booking Types
CREATE TABLE IF NOT EXISTS booking_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_page_id UUID NOT NULL REFERENCES booking_pages(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL,
  buffer_before INTEGER NOT NULL DEFAULT 0,
  buffer_after INTEGER NOT NULL DEFAULT 0,
  minimum_notice INTEGER NOT NULL DEFAULT 120,
  maximum_horizon INTEGER NOT NULL DEFAULT 30,
  cancellation_deadline INTEGER NOT NULL DEFAULT 60,
  rescheduling_enabled BOOLEAN NOT NULL DEFAULT true,
  location VARCHAR(255),
  meeting_url TEXT,
  create_task BOOLEAN NOT NULL DEFAULT false,
  task_priority VARCHAR(10) NOT NULL DEFAULT 'P3',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_booking_types_duration CHECK (duration > 0),
  CONSTRAINT chk_booking_types_buffers CHECK (buffer_before >= 0 AND buffer_after >= 0),
  CONSTRAINT chk_booking_types_notice CHECK (minimum_notice >= 0),
  CONSTRAINT chk_booking_types_horizon CHECK (maximum_horizon >= 1),
  CONSTRAINT chk_booking_types_deadline CHECK (cancellation_deadline >= 0),
  CONSTRAINT chk_booking_types_task_priority CHECK (task_priority IN ('P0', 'P1', 'P2', 'P3')),
  CONSTRAINT uq_booking_types_page_slug UNIQUE (booking_page_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_booking_types_page ON booking_types (booking_page_id) WHERE deleted_at IS NULL;

-- 3. Availability Rules
CREATE TABLE IF NOT EXISTS availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_page_id UUID NOT NULL REFERENCES booking_pages(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  effective_from DATE,
  effective_until DATE,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_availability_rules_weekday CHECK (weekday >= 0 AND weekday <= 6),
  CONSTRAINT chk_availability_rules_time CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_page ON availability_rules (booking_page_id);

-- 4. Availability Exceptions
CREATE TABLE IF NOT EXISTS availability_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_page_id UUID NOT NULL REFERENCES booking_pages(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  is_unavailable BOOLEAN NOT NULL DEFAULT true,
  start_time TIME,
  end_time TIME,
  reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_availability_exceptions_time CHECK (is_unavailable = true OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);

CREATE INDEX IF NOT EXISTS idx_availability_exceptions_page ON availability_exceptions (booking_page_id, exception_date);

-- 5. Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_type_id UUID NOT NULL REFERENCES booking_types(id) ON DELETE CASCADE,
  booking_page_id UUID NOT NULL REFERENCES booking_pages(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  guest_name VARCHAR(255) NOT NULL,
  guest_email VARCHAR(255) NOT NULL,
  guest_notes TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  buffer_start_at TIMESTAMPTZ NOT NULL,
  buffer_end_at TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED',
  calendar_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  rescheduled_from_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  rescheduled_to_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  manage_token VARCHAR(64) NOT NULL UNIQUE,
  idempotency_key VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_bookings_status CHECK (status IN ('CONFIRMED', 'CANCELLED', 'RESCHEDULED')),
  CONSTRAINT chk_bookings_time CHECK (end_at > start_at AND buffer_end_at >= end_at AND buffer_start_at <= start_at),
  CONSTRAINT chk_no_double_booking EXCLUDE USING gist (
    owner_user_id WITH =,
    tstzrange(buffer_start_at, buffer_end_at, '[)') WITH &&
  ) WHERE (status = 'CONFIRMED' AND deleted_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_bookings_owner ON bookings (owner_user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_page ON bookings (booking_page_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_manage_token ON bookings (manage_token);
CREATE INDEX IF NOT EXISTS idx_bookings_idempotency ON bookings (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_calendar_event ON bookings (calendar_event_id) WHERE calendar_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_task ON bookings (task_id) WHERE task_id IS NOT NULL;

-- Down Migration
-- DROP TABLE IF EXISTS bookings CASCADE;
-- DROP TABLE IF EXISTS availability_exceptions CASCADE;
-- DROP TABLE IF EXISTS availability_rules CASCADE;
-- DROP TABLE IF EXISTS booking_types CASCADE;
-- DROP TABLE IF EXISTS booking_pages CASCADE;
