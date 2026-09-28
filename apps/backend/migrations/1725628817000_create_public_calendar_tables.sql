-- Up Migration
-- Phase 19: Public Calendar and Share Links
-- Conforms to DATABASE-DESIGN.md Section 33, CALENDAR-SPECIFICATION.md Section 42-43, and BUSINESS-RULES.md Section 18

CREATE TABLE IF NOT EXISTS public_calendar_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  token_encrypted TEXT NULL,
  token_prefix VARCHAR(16) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ NULL,
  last_accessed_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_public_calendar_links_status CHECK (status IN ('ACTIVE', 'REVOKED'))
);

CREATE INDEX IF NOT EXISTS idx_public_calendar_links_token_hash ON public_calendar_links (token_hash) WHERE status = 'ACTIVE' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_public_calendar_links_calendar ON public_calendar_links (calendar_id, workspace_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_calendar_links_active ON public_calendar_links (calendar_id) WHERE status = 'ACTIVE' AND deleted_at IS NULL;

-- Down Migration
-- DROP TABLE IF EXISTS public_calendar_links CASCADE;
