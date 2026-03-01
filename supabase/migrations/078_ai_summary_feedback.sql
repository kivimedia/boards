-- Migration 078: Add thumbs up/down feedback on AI meeting summaries
CREATE TABLE IF NOT EXISTS ai_summary_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES fathom_recordings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_positive BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_summary_feedback_unique ON ai_summary_feedback(recording_id, user_id);
CREATE INDEX IF NOT EXISTS idx_summary_feedback_recording ON ai_summary_feedback(recording_id);

ALTER TABLE ai_summary_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "feedback_select" ON ai_summary_feedback FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "feedback_insert" ON ai_summary_feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "feedback_update" ON ai_summary_feedback FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "feedback_delete" ON ai_summary_feedback FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
