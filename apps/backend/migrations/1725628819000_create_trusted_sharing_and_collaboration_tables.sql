-- Up Migration
-- Phase 21: Trusted Sharing & Collaboration
-- Conforms to DATABASE-DESIGN.md Section 31-32, REQUIREMENTS.md Sections 26, 27, 29, and BUSINESS-RULES.md Section 20, 24

-- 1. Share Codes (Onboarding for Trusted Relationships)
CREATE TABLE IF NOT EXISTS share_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_share_codes_owner ON share_codes (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_share_codes_active ON share_codes (code_hash) WHERE used_at IS NULL AND revoked_at IS NULL;

-- 2. Comments on Collaborative Resources (Task, Project, Note)
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_comments_target_type CHECK (target_type IN ('TASK', 'PROJECT', 'NOTE'))
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments (workspace_id, target_type, target_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments (author_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments (created_at DESC);

-- 3. Mentions in Comments
CREATE TABLE IF NOT EXISTS mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_comment_mention UNIQUE (comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_mentions_user ON mentions (mentioned_user_id);

-- 4. Activity Entries (Audit & Feed for Meaningful State Changes)
CREATE TABLE IF NOT EXISTS activity_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_entries_workspace ON activity_entries (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_entries_target ON activity_entries (workspace_id, target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_entries_actor ON activity_entries (actor_user_id);

-- Down Migration
-- DROP TABLE IF EXISTS activity_entries CASCADE;
-- DROP TABLE IF EXISTS mentions CASCADE;
-- DROP TABLE IF EXISTS comments CASCADE;
-- DROP TABLE IF EXISTS share_codes CASCADE;
