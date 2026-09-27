-- Up Migration
-- Phase 10: Recurrence Rules and Occurrence Exceptions Foundation
-- Authoritative definitions matching DATABASE-DESIGN.md Section 18, CALENDAR-SPECIFICATION.md Section 11-13, and BUSINESS-RULES.md BR-REC-001..004

-- 1. recurrence_rules table (Section 18.1)
CREATE TABLE IF NOT EXISTS recurrence_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  frequency VARCHAR(20) NOT NULL,
  interval INT NOT NULL DEFAULT 1,
  by_weekday INT[] NULL,
  by_month_day INT[] NULL,
  by_month INT[] NULL,
  by_set_pos INT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NULL,
  occurrence_count INT NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  rrule_string TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_recurrence_frequency CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
  CONSTRAINT chk_recurrence_interval CHECK (interval >= 1),
  CONSTRAINT chk_recurrence_count CHECK (occurrence_count IS NULL OR occurrence_count >= 1)
);

CREATE INDEX IF NOT EXISTS idx_recurrence_rules_workspace ON recurrence_rules (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recurrence_rules_deleted_at ON recurrence_rules (deleted_at);

-- 2. recurrence_exceptions table (Section 18.2)
CREATE TABLE IF NOT EXISTS recurrence_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  recurrence_rule_id UUID NOT NULL REFERENCES recurrence_rules(id) ON DELETE CASCADE,
  occurrence_key VARCHAR(100) NOT NULL,
  original_start_at TIMESTAMPTZ NOT NULL,
  exception_type VARCHAR(50) NOT NULL,
  override_title VARCHAR(255) NULL,
  override_description TEXT NULL,
  override_start_at TIMESTAMPTZ NULL,
  override_end_at TIMESTAMPTZ NULL,
  override_is_all_day BOOLEAN NULL,
  override_status VARCHAR(50) NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_recurrence_exceptions_type CHECK (exception_type IN ('CANCELLED', 'MODIFIED', 'RESCHEDULED', 'COMPLETED')),
  CONSTRAINT uq_recurrence_exception UNIQUE (recurrence_rule_id, occurrence_key)
);

CREATE INDEX IF NOT EXISTS idx_recurrence_exceptions_rule ON recurrence_exceptions (recurrence_rule_id);
CREATE INDEX IF NOT EXISTS idx_recurrence_exceptions_workspace ON recurrence_exceptions (workspace_id);

-- 3. Link foreign keys on events and tasks
ALTER TABLE events
  ADD CONSTRAINT fk_events_recurrence_rule
  FOREIGN KEY (recurrence_rule_id) REFERENCES recurrence_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_recurrence_rule ON events (recurrence_rule_id) WHERE deleted_at IS NULL;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_rule_id UUID NULL REFERENCES recurrence_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_rule ON tasks (recurrence_rule_id) WHERE deleted_at IS NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_tasks_recurrence_rule;
ALTER TABLE tasks DROP COLUMN IF EXISTS recurrence_rule_id;
DROP INDEX IF EXISTS idx_events_recurrence_rule;
ALTER TABLE events DROP CONSTRAINT IF EXISTS fk_events_recurrence_rule;
DROP TABLE IF EXISTS recurrence_exceptions CASCADE;
DROP TABLE IF EXISTS recurrence_rules CASCADE;
