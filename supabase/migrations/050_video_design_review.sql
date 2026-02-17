-- Migration 050: Video design review support
-- Phase 9.3: Extend AI Design Review for video attachments

-- Add video-specific columns to ai_review_results
ALTER TABLE ai_review_results
  ADD COLUMN IF NOT EXISTS review_type TEXT DEFAULT 'image' CHECK (review_type IN ('image', 'video')),
  ADD COLUMN IF NOT EXISTS frame_count INTEGER,
  ADD COLUMN IF NOT EXISTS frame_verdicts JSONB,
  ADD COLUMN IF NOT EXISTS thumbnail_suggestion TEXT,
  ADD COLUMN IF NOT EXISTS video_duration_seconds NUMERIC;

-- Index for filtering by review type
CREATE INDEX IF NOT EXISTS idx_ai_review_results_type
  ON ai_review_results(review_type, created_at DESC);
