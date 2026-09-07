-- Up Migration
-- Task 5.1 & 5.2: Task Domain Database Foundation & Indexing
-- Authoritative definitions matching DATABASE-DESIGN.md Sections 11, 12, 13, 14 & DOMAIN-MODEL.md Section 6

-- 1. tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID NULL,
  board_id UUID NULL,
  board_column_id UUID NULL,
  parent_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'TODO',
  priority VARCHAR(20) NOT NULL DEFAULT 'P3',
  start_at TIMESTAMPTZ NULL,
  due_at TIMESTAMPTZ NULL,
  estimated_duration INT NULL,
  completed_at TIMESTAMPTZ NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_tasks_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT chk_tasks_status CHECK (status IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT chk_tasks_priority CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  CONSTRAINT chk_tasks_version CHECK (version >= 1),
  CONSTRAINT chk_tasks_estimated_duration CHECK (estimated_duration IS NULL OR estimated_duration >= 0)
);

-- Core task query indexes
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_lookup ON tasks (workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks (workspace_id, due_at) WHERE deleted_at IS NULL AND completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (workspace_id, priority) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks (parent_task_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks (assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks (deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_search_title ON tasks USING gin (to_tsvector('english', title));

-- 2. labels table
CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(50) NOT NULL DEFAULT '#4F46E5',
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_labels_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_labels_workspace_name ON labels (workspace_id, LOWER(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_labels_workspace_id ON labels (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_labels_deleted_at ON labels (deleted_at);

-- 3. task_labels join table
CREATE TABLE IF NOT EXISTS task_labels (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_task_labels_label_id ON task_labels (label_id);

-- 4. task_dependencies table
CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(50) NOT NULL DEFAULT 'BLOCKS',
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_task_dependencies_not_self CHECK (task_id != depends_on_task_id),
  CONSTRAINT uq_task_dependencies_pair UNIQUE (task_id, depends_on_task_id),
  CONSTRAINT chk_task_dependencies_type CHECK (dependency_type IN ('BLOCKS', 'BLOCKED_BY', 'DEPENDS_ON', 'RELATED_TO'))
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies (depends_on_task_id);

-- 5. task_links table
CREATE TABLE IF NOT EXISTS task_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title VARCHAR(255) NULL,
  link_type VARCHAR(50) NOT NULL DEFAULT 'EXTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_task_links_type CHECK (link_type IN ('EXTERNAL', 'INTERNAL')),
  CONSTRAINT chk_task_links_url_not_empty CHECK (length(trim(url)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_task_links_task_id ON task_links (task_id);

-- 6. task_work_blocks table (Phase 5 relational foundation for planned work intervals)
CREATE TABLE IF NOT EXISTS task_work_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  calendar_id UUID NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_task_work_blocks_time CHECK (end_at > start_at),
  CONSTRAINT chk_task_work_blocks_status CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_task_work_blocks_task_id ON task_work_blocks (task_id);

-- Down Migration
DROP TABLE IF EXISTS task_work_blocks CASCADE;
DROP TABLE IF EXISTS task_links CASCADE;
DROP TABLE IF EXISTS task_dependencies CASCADE;
DROP TABLE IF EXISTS task_labels CASCADE;
DROP TABLE IF EXISTS labels CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
