-- Migration 011: AI Design Review (P2.1)
-- Review results tracking and attachment versioning for design review pipeline

-- ============================================================================
-- AI REVIEW RESULTS
-- ============================================================================
CREATE TABLE ai_review_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  previous_attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  change_requests JSONB NOT NULL DEFAULT '[]',
  verdicts JSONB NOT NULL DEFAULT '[]',
  overall_verdict TEXT NOT NULL DEFAULT 'pending',
  summary TEXT,
  confidence_score NUMERIC(5,2),
  model_used TEXT,
  usage_log_id UUID REFERENCES ai_usage_log(id) ON DELETE SET NULL,
  override_verdict TEXT,
  override_reason TEXT,
  overridden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  overridden_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- overall_verdict values: 'pending', 'approved', 'revisions_needed', 'overridden_approved', 'overridden_rejected'
-- change_requests: [{ "index": 1, "text": "Change the header color to blue" }, ...]
-- verdicts: [{ "index": 1, "verdict": "PASS|FAIL|PARTIAL", "reasoning": "...", "suggestions": "..." }, ...]

CREATE INDEX idx_ai_review_results_card ON ai_review_results(card_id);
CREATE INDEX idx_ai_review_results_verdict ON ai_review_results(overall_verdict);
CREATE INDEX idx_ai_review_results_created_at ON ai_review_results(created_at DESC);

-- ============================================================================
-- ATTACHMENT VERSIONING
-- ============================================================================
ALTER TABLE attachments ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attachments ADD COLUMN parent_attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL;

CREATE INDEX idx_attachments_parent ON attachments(parent_attachment_id);
CREATE INDEX idx_attachments_version ON attachments(card_id, version DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE ai_review_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_review_results_select" ON ai_review_results
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_review_results_insert" ON ai_review_results
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ai_review_results_update" ON ai_review_results
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "ai_review_results_delete" ON ai_review_results
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_ai_review_results_updated_at
  BEFORE UPDATE ON ai_review_results FOR EACH ROW EXECUTE FUNCTION update_updated_at();
