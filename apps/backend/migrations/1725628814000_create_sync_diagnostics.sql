-- Up Migration
-- Phase 16: Synchronization Hardening - Sync Diagnostics & Enhanced Sync State Schema
-- Conforms to docs/7.DATABASE-DESIGN.md Section 28 & 29, docs/21.COST-ARCHITECTURE.md Section 30 & 31, and docs/8.SYNC-SPECIFICATION.md

-- 1. Update integrations status to allow 'UNAVAILABLE' state
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS chk_integrations_status;
ALTER TABLE integrations ADD CONSTRAINT chk_integrations_status
  CHECK (status IN ('DISCONNECTED', 'AUTHORIZING', 'CONNECTED', 'SYNCING', 'ERROR', 'REAUTH_REQUIRED', 'UNAVAILABLE'));

-- 2. Create sync_diagnostics table
CREATE TABLE IF NOT EXISTS sync_diagnostics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'GOOGLE',
  integration_service VARCHAR(50) NOT NULL,
  sync_direction VARCHAR(50) NOT NULL DEFAULT 'BIDIRECTIONAL',
  sync_operation_type VARCHAR(50) NOT NULL DEFAULT 'INCREMENTAL',
  status VARCHAR(50) NOT NULL,
  failure_category VARCHAR(50) NULL,
  failure_reason VARCHAR(100) NULL,
  error_code VARCHAR(100) NULL,
  error_message TEXT NULL,
  records_examined INT NOT NULL DEFAULT 0,
  records_created INT NOT NULL DEFAULT 0,
  records_updated INT NOT NULL DEFAULT 0,
  records_deleted INT NOT NULL DEFAULT 0,
  records_conflicted INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_ms INT NOT NULL DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  retry_state VARCHAR(50) NOT NULL DEFAULT 'NONE',
  correlation_id VARCHAR(255) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_sync_diag_provider CHECK (provider IN ('GOOGLE')),
  CONSTRAINT chk_sync_diag_service CHECK (integration_service IN ('CALENDAR', 'TASKS', 'DRIVE')),
  CONSTRAINT chk_sync_diag_status CHECK (status IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED')),
  CONSTRAINT chk_sync_diag_direction CHECK (sync_direction IN ('INCOMING', 'OUTGOING', 'BIDIRECTIONAL')),
  CONSTRAINT chk_sync_diag_op_type CHECK (sync_operation_type IN ('INCREMENTAL', 'FULL', 'EXPORT', 'IMPORT', 'RECONCILE')),
  CONSTRAINT chk_sync_diag_retry_state CHECK (retry_state IN ('NONE', 'SCHEDULED', 'EXHAUSTED'))
);

CREATE INDEX IF NOT EXISTS idx_sync_diagnostics_user ON sync_diagnostics (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_diagnostics_workspace ON sync_diagnostics (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_diagnostics_service ON sync_diagnostics (provider, integration_service, status);
CREATE INDEX IF NOT EXISTS idx_sync_diagnostics_correlation ON sync_diagnostics (correlation_id);

-- Down Migration
DROP TABLE IF EXISTS sync_diagnostics CASCADE;

ALTER TABLE integrations DROP CONSTRAINT IF EXISTS chk_integrations_status;
ALTER TABLE integrations ADD CONSTRAINT chk_integrations_status
  CHECK (status IN ('DISCONNECTED', 'AUTHORIZING', 'CONNECTED', 'SYNCING', 'ERROR', 'REAUTH_REQUIRED'));
