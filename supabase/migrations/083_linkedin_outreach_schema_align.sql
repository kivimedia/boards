-- Alignment migration: fix li_learning_log schema to match Phase 3 code
-- The original 081 migration had simpler columns; Phase 3 feedback-loop.ts needs these

ALTER TABLE li_learning_log ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE li_learning_log ADD COLUMN IF NOT EXISTS before_value TEXT;
ALTER TABLE li_learning_log ADD COLUMN IF NOT EXISTS after_value TEXT;
ALTER TABLE li_learning_log ADD COLUMN IF NOT EXISTS rule_snapshot_id UUID;
ALTER TABLE li_learning_log ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- Change evidence from TEXT to JSONB
ALTER TABLE li_learning_log ALTER COLUMN evidence TYPE JSONB
  USING CASE
    WHEN evidence IS NULL THEN '{}'::jsonb
    WHEN evidence = '' THEN '{}'::jsonb
    ELSE evidence::jsonb
  END;

-- Expand status constraint to include 'pending' alongside 'proposed'
ALTER TABLE li_learning_log DROP CONSTRAINT IF EXISTS li_learning_log_status_check;
ALTER TABLE li_learning_log ADD CONSTRAINT li_learning_log_status_check
  CHECK (status IN ('proposed', 'pending', 'approved', 'rejected', 'rolled_back'));

-- Rename any 'proposed' to 'pending' for consistency
UPDATE li_learning_log SET status = 'pending' WHERE status = 'proposed';
