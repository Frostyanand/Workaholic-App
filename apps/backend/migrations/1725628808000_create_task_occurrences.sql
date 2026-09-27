-- Up Migration
-- Phase 10.13: Dedicated Sparse Task Occurrences Foundation
-- Decoupled Occurrence-State Model satisfying BR-TASK-008 and BR-REC-001..004

CREATE TABLE IF NOT EXISTS task_occurrences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  occurrence_key VARCHAR(100) NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  original_due_at TIMESTAMPTZ NULL,
  original_due_date DATE NULL,
  override_due_at TIMESTAMPTZ NULL,
  override_due_date DATE NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'TODO',
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_task_occurrence_status CHECK (status IN ('TODO', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT chk_task_occ_due_type CHECK (
    (is_all_day = FALSE AND original_due_at IS NOT NULL AND original_due_date IS NULL) OR
    (is_all_day = TRUE AND original_due_date IS NOT NULL AND original_due_at IS NULL)
  ),
  CONSTRAINT uq_task_occurrence UNIQUE (task_id, occurrence_key)
);

CREATE INDEX IF NOT EXISTS idx_task_occurrences_task_id ON task_occurrences (task_id);
CREATE INDEX IF NOT EXISTS idx_task_occurrences_workspace_status ON task_occurrences (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_task_occurrences_completed_at ON task_occurrences (workspace_id, completed_at);

-- Down Migration
DROP TABLE IF EXISTS task_occurrences CASCADE;
