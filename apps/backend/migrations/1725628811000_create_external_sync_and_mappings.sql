-- Up Migration
-- Phase 13: Google Calendar Integration - External Object Mappings & Synchronization Schema
-- Conforms to docs/7.DATABASE-DESIGN.md Section 28 & 29, docs/19.INTEGRATION-SPECIFICATION.md, and docs/8.SYNC-SPECIFICATION.md

-- 1. Update integrations status to allow 'SYNCING' state
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS chk_integrations_status;
ALTER TABLE integrations ADD CONSTRAINT chk_integrations_status
  CHECK (status IN ('DISCONNECTED', 'AUTHORIZING', 'CONNECTED', 'SYNCING', 'ERROR', 'REAUTH_REQUIRED'));

-- 2. external_object_mappings table (DATABASE-DESIGN.md Section 29.1)
CREATE TABLE IF NOT EXISTS external_object_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  external_account_id VARCHAR(255) NOT NULL,
  external_container_id VARCHAR(255) NULL,
  external_object_type VARCHAR(50) NOT NULL,
  external_object_id VARCHAR(255) NOT NULL,
  native_object_type VARCHAR(50) NOT NULL,
  native_object_id UUID NOT NULL,
  sync_state VARCHAR(50) NOT NULL DEFAULT 'SYNCED',
  external_etag VARCHAR(255) NULL,
  sync_cursor TEXT NULL,
  last_external_modified_at TIMESTAMPTZ NULL,
  last_native_modified_at TIMESTAMPTZ NULL,
  last_synced_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_ext_obj_mappings_provider CHECK (provider IN ('GOOGLE')),
  CONSTRAINT chk_ext_obj_mappings_ext_type CHECK (external_object_type IN ('CALENDAR', 'EVENT', 'TASK', 'FILE')),
  CONSTRAINT chk_ext_obj_mappings_nat_type CHECK (native_object_type IN ('CALENDAR', 'EVENT', 'TASK', 'NOTE')),
  CONSTRAINT chk_ext_obj_mappings_sync_state CHECK (sync_state IN ('SYNCED', 'PENDING_UPLOAD', 'PENDING_DOWNLOAD', 'CONFLICT', 'DELETED_EXTERNALLY', 'DETACHED')),
  CONSTRAINT uq_ext_obj_mappings_external UNIQUE (provider, external_account_id, external_object_type, external_object_id),
  CONSTRAINT uq_ext_obj_mappings_native UNIQUE (provider, user_id, native_object_type, native_object_id)
);

CREATE INDEX IF NOT EXISTS idx_ext_obj_mappings_user ON external_object_mappings (user_id);
CREATE INDEX IF NOT EXISTS idx_ext_obj_mappings_workspace ON external_object_mappings (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ext_obj_mappings_native ON external_object_mappings (native_object_type, native_object_id);
CREATE INDEX IF NOT EXISTS idx_ext_obj_mappings_external ON external_object_mappings (provider, external_object_type, external_object_id);
CREATE INDEX IF NOT EXISTS idx_ext_obj_mappings_container ON external_object_mappings (provider, external_container_id);
CREATE INDEX IF NOT EXISTS idx_ext_obj_mappings_sync_state ON external_object_mappings (sync_state);

-- Down Migration
DROP TABLE IF EXISTS external_object_mappings CASCADE;
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS chk_integrations_status;
ALTER TABLE integrations ADD CONSTRAINT chk_integrations_status
  CHECK (status IN ('DISCONNECTED', 'AUTHORIZING', 'CONNECTED', 'ERROR', 'REAUTH_REQUIRED'));
