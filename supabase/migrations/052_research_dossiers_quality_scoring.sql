-- ============================================================================
-- Migration 052: Research Dossiers, Quality Scoring, and Outreach Pipeline
-- ============================================================================
-- Adds:
--   1. pga_research_dossiers - Deep research data per candidate (7-step plan)
--   2. quality_score + tier columns on pga_candidates
--   3. pga_outreach_runs - Track outreach email generation & sending
--   4. pga_scout_costs - Per-run cost tracking for Hunter/Snov/Claude
-- ============================================================================

-- 1. Add quality_score and tier to pga_candidates
ALTER TABLE pga_candidates
  ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'cold'
    CHECK (tier IN ('hot', 'warm', 'cold'));

-- Index for filtering by tier
CREATE INDEX IF NOT EXISTS idx_pga_candidates_tier ON pga_candidates(tier);
CREATE INDEX IF NOT EXISTS idx_pga_candidates_quality_score ON pga_candidates(quality_score DESC);

-- 2. Research dossiers table
CREATE TABLE IF NOT EXISTS pga_research_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES pga_candidates(id) ON DELETE CASCADE,
  run_id UUID REFERENCES pga_agent_runs(id) ON DELETE SET NULL,

  -- Research content
  personalization_elements JSONB DEFAULT '[]'::jsonb,
  -- Each element: { fact, source_url, source_type, screenshot_or_quote,
  --                 date_found, confidence, verification_status, validation_details }

  tone_profile JSONB DEFAULT '{}'::jsonb,
  -- { communication_style, favorite_topics, pet_peeves, humor_level,
  --   formality, preferred_platforms }

  story_angle TEXT,
  -- Recommended angle for outreach (1-2 sentences)

  potential_hooks JSONB DEFAULT '[]'::jsonb,
  -- Array of hook strings the copywriter can use

  red_flags JSONB DEFAULT '[]'::jsonb,
  -- Things to avoid mentioning

  -- Validation summary
  validation_summary JSONB DEFAULT '{}'::jsonb,
  -- { total_elements, verified, unverified, stale, risky,
  --   usable_for_copy, validation_date }

  -- Research metadata
  research_plan_used TEXT,
  sources_checked INTEGER DEFAULT 0,
  sources_found INTEGER DEFAULT 0,
  research_duration_ms INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One dossier per candidate (latest wins)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pga_dossiers_candidate
  ON pga_research_dossiers(candidate_id);

-- RLS for research dossiers
ALTER TABLE pga_research_dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dossiers_select" ON pga_research_dossiers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

CREATE POLICY "dossiers_insert" ON pga_research_dossiers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

CREATE POLICY "dossiers_update" ON pga_research_dossiers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

CREATE POLICY "dossiers_delete" ON pga_research_dossiers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.role = 'admin'
    )
  );

-- 3. Outreach runs table - tracks email draft generation
CREATE TABLE IF NOT EXISTS pga_outreach_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES pga_candidates(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES pga_research_dossiers(id) ON DELETE SET NULL,
  run_id UUID REFERENCES pga_agent_runs(id) ON DELETE SET NULL,

  -- Touch sequence (1 = initial, 2 = follow-up, 3 = final)
  touch_number INTEGER NOT NULL DEFAULT 1 CHECK (touch_number BETWEEN 1 AND 3),

  -- Generated email
  subject TEXT,
  body TEXT,
  generation_prompt TEXT,

  -- Validation
  copy_validation JSONB DEFAULT '{}'::jsonb,
  -- { passed, all_claims_traced, no_filler_phrases, booking_link_present,
  --   word_count_ok, no_emdashes, issues[] }

  -- Send status
  send_status TEXT DEFAULT 'draft'
    CHECK (send_status IN ('draft', 'approved', 'sent', 'bounced', 'replied', 'unsubscribed')),
  sent_at TIMESTAMPTZ,
  resend_id TEXT,

  -- Response tracking
  response_type TEXT CHECK (response_type IN ('interested', 'maybe_later', 'declined', 'question', NULL)),
  response_at TIMESTAMPTZ,

  -- Cost
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pga_outreach_candidate ON pga_outreach_runs(candidate_id);
CREATE INDEX IF NOT EXISTS idx_pga_outreach_status ON pga_outreach_runs(send_status);

-- RLS for outreach runs
ALTER TABLE pga_outreach_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outreach_select" ON pga_outreach_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

CREATE POLICY "outreach_insert" ON pga_outreach_runs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

CREATE POLICY "outreach_update" ON pga_outreach_runs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

CREATE POLICY "outreach_delete" ON pga_outreach_runs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.role = 'admin'
    )
  );

-- 4. Scout cost tracking table
CREATE TABLE IF NOT EXISTS pga_scout_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pga_agent_runs(id) ON DELETE CASCADE,

  -- Service breakdown
  service TEXT NOT NULL CHECK (service IN ('hunter', 'snov', 'anthropic', 'resend')),
  operation TEXT NOT NULL,
  -- hunter: domain_search, email_finder, email_verifier
  -- snov: linkedin_enrichment, email_search, email_verify
  -- anthropic: linkedin_discovery, deep_research, dossier_research, email_generation
  -- resend: email_send

  -- Usage
  credits_used NUMERIC(10,4) DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  api_calls INTEGER DEFAULT 1,

  -- Context
  candidate_name TEXT,
  candidate_id UUID REFERENCES pga_candidates(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pga_costs_run ON pga_scout_costs(run_id);
CREATE INDEX IF NOT EXISTS idx_pga_costs_service ON pga_scout_costs(service);

-- RLS for scout costs
ALTER TABLE pga_scout_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "costs_select" ON pga_scout_costs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

CREATE POLICY "costs_insert" ON pga_scout_costs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

-- 5. Add follow-up scheduling columns to pga_candidates
ALTER TABLE pga_candidates
  ADD COLUMN IF NOT EXISTS next_followup_date DATE,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS touch_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unsubscribed BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pga_candidates_followup
  ON pga_candidates(next_followup_date)
  WHERE next_followup_date IS NOT NULL AND unsubscribed = false;
