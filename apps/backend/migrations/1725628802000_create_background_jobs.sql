-- Up Migration
-- Workaholic Background Job Queue Foundation
-- Conforms to docs/6.SYSTEM-ARCHITECTURE.md Section 35, 36, 64 and AGENTS.md

CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    queue VARCHAR(100) NOT NULL DEFAULT 'default',
    job_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CONSTRAINT chk_background_jobs_status CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    priority INTEGER NOT NULL DEFAULT 0,
    run_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(255),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- Index for concurrent polling with FOR UPDATE SKIP LOCKED
CREATE INDEX IF NOT EXISTS idx_background_jobs_poll
    ON background_jobs (queue, priority DESC, run_at ASC)
    WHERE status = 'PENDING';

-- Index for status filtering and queue metrics
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_run_at
    ON background_jobs (status, run_at);

CREATE INDEX IF NOT EXISTS idx_background_jobs_queue_status
    ON background_jobs (queue, status);

-- Down Migration
DROP TABLE IF EXISTS background_jobs CASCADE;
