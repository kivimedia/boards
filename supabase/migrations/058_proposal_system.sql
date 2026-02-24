-- Migration 058: Proposal intelligence system
-- AI-powered proposal patterns and generated drafts

CREATE TABLE IF NOT EXISTS proposal_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- e.g. "Standard Birthday Arch + Bouquets"
  event_types JSONB DEFAULT '[]', -- ["Birthday", "Baby Shower"]
  products JSONB DEFAULT '[]', -- array of ProposalLineItem objects
  typical_price_min NUMERIC(10,2),
  typical_price_max NUMERIC(10,2),
  match_keywords JSONB DEFAULT '[]', -- keywords that trigger this pattern
  confidence_threshold NUMERIC(3,2) DEFAULT 0.70,
  historical_acceptance_rate NUMERIC(3,2),
  sample_proposal_ids JSONB DEFAULT '[]', -- reference card IDs
  is_no_brainer BOOLEAN DEFAULT false, -- fast-track approval eligible
  created_from_count INTEGER DEFAULT 0, -- how many historical proposals informed this
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposal_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES cards ON DELETE CASCADE,
  pattern_id UUID REFERENCES proposal_patterns ON DELETE SET NULL,
  confidence_tier TEXT NOT NULL DEFAULT 'needs_human', -- no_brainer, suggested, needs_human
  line_items JSONB DEFAULT '[]', -- array of ProposalLineItem objects
  total_amount NUMERIC(10,2),
  email_subject TEXT,
  email_body TEXT,
  status TEXT DEFAULT 'draft', -- draft, approved, rejected, sent, modified
  approved_by UUID REFERENCES auth.users,
  approved_at TIMESTAMPTZ,
  modifications JSONB, -- tracks delta between AI draft and human-modified version
  sent_via TEXT, -- gmail, manual
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE proposal_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposal_patterns_select" ON proposal_patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY "proposal_patterns_insert" ON proposal_patterns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "proposal_patterns_update" ON proposal_patterns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "proposal_patterns_delete" ON proposal_patterns FOR DELETE TO authenticated USING (true);

CREATE POLICY "proposal_drafts_select" ON proposal_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "proposal_drafts_insert" ON proposal_drafts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "proposal_drafts_update" ON proposal_drafts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "proposal_drafts_delete" ON proposal_drafts FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proposal_drafts_card ON proposal_drafts(card_id);
CREATE INDEX IF NOT EXISTS idx_proposal_drafts_status ON proposal_drafts(status);
CREATE INDEX IF NOT EXISTS idx_proposal_drafts_tier ON proposal_drafts(confidence_tier);
CREATE INDEX IF NOT EXISTS idx_proposal_patterns_active ON proposal_patterns(is_active) WHERE is_active = true;

-- Auto-update updated_at
CREATE TRIGGER set_proposal_patterns_updated_at
  BEFORE UPDATE ON proposal_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_proposal_drafts_updated_at
  BEFORE UPDATE ON proposal_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable realtime for proposal drafts (for live queue updates)
ALTER PUBLICATION supabase_realtime ADD TABLE proposal_drafts;
