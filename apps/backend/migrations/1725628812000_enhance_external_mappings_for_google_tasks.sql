-- Up Migration
-- Phase 14: Google Tasks Integration - External Object Mappings & Tasks Provenance Schema
-- Conforms to docs/7.DATABASE-DESIGN.md Section 28 & 29, docs/19.INTEGRATION-SPECIFICATION.md, and docs/8.SYNC-SPECIFICATION.md

-- 1. Update external_object_mappings constraints to support TASK_LIST and PROJECT containers
ALTER TABLE external_object_mappings DROP CONSTRAINT IF EXISTS chk_ext_obj_mappings_ext_type;
ALTER TABLE external_object_mappings ADD CONSTRAINT chk_ext_obj_mappings_ext_type
  CHECK (external_object_type IN ('CALENDAR', 'EVENT', 'TASK', 'FILE', 'TASK_LIST'));

ALTER TABLE external_object_mappings DROP CONSTRAINT IF EXISTS chk_ext_obj_mappings_nat_type;
ALTER TABLE external_object_mappings ADD CONSTRAINT chk_ext_obj_mappings_nat_type
  CHECK (native_object_type IN ('CALENDAR', 'EVENT', 'TASK', 'NOTE', 'PROJECT'));

-- 2. Add provenance columns to tasks table matching events table pattern
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) NOT NULL DEFAULT 'WORKAHOLIC';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_reference VARCHAR(255) NULL;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_source_type;
ALTER TABLE tasks ADD CONSTRAINT chk_tasks_source_type
  CHECK (source_type IN ('WORKAHOLIC', 'GOOGLE', 'IMPORTED'));

CREATE INDEX IF NOT EXISTS idx_tasks_source_type ON tasks (source_type);

-- Down Migration
DROP INDEX IF EXISTS idx_tasks_source_type;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_source_type;
ALTER TABLE tasks DROP COLUMN IF EXISTS source_reference;
ALTER TABLE tasks DROP COLUMN IF EXISTS source_type;

ALTER TABLE external_object_mappings DROP CONSTRAINT IF EXISTS chk_ext_obj_mappings_nat_type;
ALTER TABLE external_object_mappings ADD CONSTRAINT chk_ext_obj_mappings_nat_type
  CHECK (native_object_type IN ('CALENDAR', 'EVENT', 'TASK', 'NOTE'));

ALTER TABLE external_object_mappings DROP CONSTRAINT IF EXISTS chk_ext_obj_mappings_ext_type;
ALTER TABLE external_object_mappings ADD CONSTRAINT chk_ext_obj_mappings_ext_type
  CHECK (external_object_type IN ('CALENDAR', 'EVENT', 'TASK', 'FILE'));
