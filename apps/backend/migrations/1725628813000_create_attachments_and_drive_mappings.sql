-- Up Migration
-- Phase 15: Google Drive Integration - Attachments, External Files & Drive Mappings Schema
-- Conforms to docs/7.DATABASE-DESIGN.md Section 27 & 28, docs/19.INTEGRATION-SPECIFICATION.md, and docs/8.SYNC-SPECIFICATION.md

-- 1. Update external_object_mappings constraints to support FOLDER, FILE, ATTACHMENT, and WORKSPACE
ALTER TABLE external_object_mappings DROP CONSTRAINT IF EXISTS chk_ext_obj_mappings_ext_type;
ALTER TABLE external_object_mappings ADD CONSTRAINT chk_ext_obj_mappings_ext_type
  CHECK (external_object_type IN ('CALENDAR', 'EVENT', 'TASK', 'FILE', 'TASK_LIST', 'FOLDER'));

ALTER TABLE external_object_mappings DROP CONSTRAINT IF EXISTS chk_ext_obj_mappings_nat_type;
ALTER TABLE external_object_mappings ADD CONSTRAINT chk_ext_obj_mappings_nat_type
  CHECK (native_object_type IN ('CALENDAR', 'EVENT', 'TASK', 'NOTE', 'PROJECT', 'ATTACHMENT', 'WORKSPACE'));

-- 2. Create attachments table (DATABASE-DESIGN.md Section 27.1)
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  external_file_id VARCHAR(255) NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  source_type VARCHAR(50) NOT NULL DEFAULT 'GOOGLE_DRIVE',
  upload_status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
  web_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_attachments_target_type CHECK (target_type IN ('TASK', 'PROJECT', 'NOTE')),
  CONSTRAINT chk_attachments_source_type CHECK (source_type IN ('GOOGLE_DRIVE', 'LOCAL', 'EXTERNAL')),
  CONSTRAINT chk_attachments_upload_status CHECK (upload_status IN ('PENDING', 'UPLOADING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_attachments_workspace ON attachments (workspace_id);
CREATE INDEX IF NOT EXISTS idx_attachments_target ON attachments (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_external_file ON attachments (external_file_id);

-- 3. Create external_files table (DATABASE-DESIGN.md Section 27.2)
CREATE TABLE IF NOT EXISTS external_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(50) NOT NULL,
  external_file_id VARCHAR(255) NOT NULL,
  external_account_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  web_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_external_files_provider UNIQUE (provider, external_account_id, external_file_id)
);

CREATE INDEX IF NOT EXISTS idx_external_files_provider_file ON external_files (provider, external_file_id);

-- Down Migration
DROP TABLE IF EXISTS external_files CASCADE;
DROP TABLE IF EXISTS attachments CASCADE;

ALTER TABLE external_object_mappings DROP CONSTRAINT IF EXISTS chk_ext_obj_mappings_nat_type;
ALTER TABLE external_object_mappings ADD CONSTRAINT chk_ext_obj_mappings_nat_type
  CHECK (native_object_type IN ('CALENDAR', 'EVENT', 'TASK', 'NOTE', 'PROJECT'));

ALTER TABLE external_object_mappings DROP CONSTRAINT IF EXISTS chk_ext_obj_mappings_ext_type;
ALTER TABLE external_object_mappings ADD CONSTRAINT chk_ext_obj_mappings_ext_type
  CHECK (external_object_type IN ('CALENDAR', 'EVENT', 'TASK', 'FILE', 'TASK_LIST'));
