-- Up Migration
-- Task 6.1 & 6.3: Project and Board Domain Database Foundation
-- Authoritative definitions matching DATABASE-DESIGN.md Sections 9 & 10, DOMAIN-MODEL.md Sections 7 & 8, and BUSINESS-RULES.md

-- 1. projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  owner_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  start_at TIMESTAMPTZ NULL,
  due_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_projects_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT chk_projects_status CHECK (status IN ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_lookup ON projects (workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_owner_user_id ON projects (owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects (deleted_at);
CREATE INDEX IF NOT EXISTS idx_projects_search_name ON projects USING gin (to_tsvector('english', name));

-- 2. project_members table
CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'MEMBER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  CONSTRAINT chk_project_members_role CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER'))
);

CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members (user_id);

-- 3. boards table
CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_boards_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_boards_workspace_lookup ON boards (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_boards_project_id ON boards (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_boards_deleted_at ON boards (deleted_at);

-- 4. board_columns table
CREATE TABLE IF NOT EXISTS board_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  status_mapping VARCHAR(50) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_board_columns_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT chk_board_columns_status_mapping CHECK (status_mapping IS NULL OR status_mapping IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT chk_board_columns_position CHECK (position >= 0),
  CONSTRAINT uq_board_columns_position UNIQUE (board_id, position)
);

CREATE INDEX IF NOT EXISTS idx_board_columns_board_position ON board_columns (board_id, position);

-- 5. Link tasks table to projects, boards, and board columns
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_board_column FOREIGN KEY (board_column_id) REFERENCES board_columns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks (board_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_board_column_id ON tasks (board_column_id) WHERE deleted_at IS NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_tasks_board_column_id;
DROP INDEX IF EXISTS idx_tasks_board_id;
DROP INDEX IF EXISTS idx_tasks_project_id;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_board_column;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_board;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_project;
DROP TABLE IF EXISTS board_columns CASCADE;
DROP TABLE IF EXISTS boards CASCADE;
DROP TABLE IF EXISTS project_members CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
