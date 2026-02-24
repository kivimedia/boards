-- 054: Parallel migration support (parent-child job model)
-- Adds columns to migration_jobs to support running multiple boards in parallel

ALTER TABLE migration_jobs
  ADD COLUMN IF NOT EXISTS parent_job_id UUID REFERENCES migration_jobs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS board_index SMALLINT,
  ADD COLUMN IF NOT EXISTS trello_board_id TEXT,
  ADD COLUMN IF NOT EXISTS trello_board_name TEXT;

-- Fast lookup of children by parent
CREATE INDEX IF NOT EXISTS idx_migration_jobs_parent_job_id
  ON migration_jobs(parent_job_id)
  WHERE parent_job_id IS NOT NULL;
