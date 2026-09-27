-- Up Migration
-- Phase 12: General-Purpose Background Job Infrastructure Enhancements
-- Conforms to docs/phase-wise-plan.md Section 16 & docs/6.SYSTEM-ARCHITECTURE.md Section 35, 36

-- 1. Allow 'DEAD_LETTER' status in background_jobs
ALTER TABLE background_jobs DROP CONSTRAINT IF EXISTS chk_background_jobs_status;
ALTER TABLE background_jobs ADD CONSTRAINT chk_background_jobs_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTER'));

-- 2. Add columns for dead-letter diagnostic reason and idempotent job deduplication key
ALTER TABLE background_jobs ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT;
ALTER TABLE background_jobs ADD COLUMN IF NOT EXISTS job_key VARCHAR(255);

-- 3. Idempotent partial unique index: ensures no two active (PENDING or PROCESSING) jobs share the same key in a queue
CREATE UNIQUE INDEX IF NOT EXISTS idx_background_jobs_job_key
    ON background_jobs (queue, job_key)
    WHERE status IN ('PENDING', 'PROCESSING');

-- 4. Observability and maintenance indexes
CREATE INDEX IF NOT EXISTS idx_background_jobs_stale_recovery
    ON background_jobs (status, locked_at)
    WHERE status = 'PROCESSING';

CREATE INDEX IF NOT EXISTS idx_background_jobs_dead_letter
    ON background_jobs (queue, status)
    WHERE status = 'DEAD_LETTER';

-- Down Migration
DROP INDEX IF EXISTS idx_background_jobs_dead_letter;
DROP INDEX IF EXISTS idx_background_jobs_stale_recovery;
DROP INDEX IF EXISTS idx_background_jobs_job_key;
ALTER TABLE background_jobs DROP COLUMN IF EXISTS job_key;
ALTER TABLE background_jobs DROP COLUMN IF EXISTS dead_letter_reason;
ALTER TABLE background_jobs DROP CONSTRAINT IF EXISTS chk_background_jobs_status;
ALTER TABLE background_jobs ADD CONSTRAINT chk_background_jobs_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'));
