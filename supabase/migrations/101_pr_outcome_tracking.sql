-- Migration 101: PR Outcome Tracking + Native Speaker Review Flag
-- Task 2: Outcome columns on pr_outlets
-- Task 3: Native review columns on pr_runs

-- ============================================================================
-- Task 2A: Outcome tracking on pr_outlets
-- ============================================================================

ALTER TABLE pr_outlets
  ADD COLUMN IF NOT EXISTS outcome TEXT
    CHECK (outcome IN ('no_response', 'positive', 'neutral', 'negative'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS outcome_notes TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS outcome_date TIMESTAMPTZ DEFAULT NULL;

-- ============================================================================
-- Task 3A: Native speaker review columns on pr_runs
-- ============================================================================

ALTER TABLE pr_runs
  ADD COLUMN IF NOT EXISTS native_review_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS native_review_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS native_reviewer_notes TEXT DEFAULT NULL;
