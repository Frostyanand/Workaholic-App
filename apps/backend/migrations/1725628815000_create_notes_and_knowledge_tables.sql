-- Up Migration
-- Phase 17: Notes / Knowledge Workspace Schema
-- Conforms to docs/7.DATABASE-DESIGN.md Section 26, docs/3.domain-model.md Section 13, and docs/2.requirements.md REQ-NOTE-001 through REQ-NOTE-008

-- 1. Create notes table
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'Untitled Note',
  content JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_text TEXT NOT NULL DEFAULT '',
  content_format VARCHAR(50) NOT NULL DEFAULT 'STRUCTURED',
  category VARCHAR(100) NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_workspace_updated ON notes (workspace_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_workspace_pinned ON notes (workspace_id, is_pinned) WHERE deleted_at IS NULL AND is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_notes_workspace_archived ON notes (workspace_id, is_archived) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_workspace_category ON notes (workspace_id, category) WHERE deleted_at IS NULL AND category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes (owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_fts ON notes USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_text, ''))) WHERE deleted_at IS NULL;

-- 2. Create tags table
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(50) NOT NULL DEFAULT '#6366F1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_tags_workspace_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_workspace ON tags (workspace_id);

-- 3. Create note_tags join table
CREATE TABLE IF NOT EXISTS note_tags (
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags (tag_id);

-- 4. Create note_relationships table
CREATE TABLE IF NOT EXISTS note_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  relationship_type VARCHAR(50) NOT NULL DEFAULT 'RELATES_TO',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_note_relationships_target_type CHECK (target_type IN ('TASK', 'PROJECT', 'EVENT', 'NOTE', 'BOARD', 'PERSON')),
  CONSTRAINT chk_note_relationships_type CHECK (relationship_type IN ('RELATES_TO', 'REFERENCES', 'DEPENDS_ON', 'CONVERTED_FROM')),
  CONSTRAINT uq_note_relationships_note_target UNIQUE (note_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_note_relationships_note ON note_relationships (note_id);
CREATE INDEX IF NOT EXISTS idx_note_relationships_target ON note_relationships (workspace_id, target_type, target_id);

-- Down Migration
-- DROP TABLE IF EXISTS note_relationships CASCADE;
-- DROP TABLE IF EXISTS note_tags CASCADE;
-- DROP TABLE IF EXISTS tags CASCADE;
-- DROP TABLE IF EXISTS notes CASCADE;
