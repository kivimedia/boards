-- Team PR: Agentic PR outreach pipeline
-- 4-stage pipeline: Research -> Verification -> QA Loop -> Email Generation
-- First client: Caroline Ravn (Swedish media targeting)

-- ============================================================================
-- pr_clients: Client profiles with brand voice and pitch configuration
-- ============================================================================
CREATE TABLE pr_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  company TEXT,
  industry TEXT,
  website TEXT,
  brand_voice JSONB DEFAULT '{}',
  pitch_angles JSONB DEFAULT '[]',
  tone_rules JSONB DEFAULT '{}',
  bio TEXT,
  headshot_url TEXT,
  media_kit_url TEXT,
  exclusion_list TEXT[] DEFAULT '{}',
  target_markets TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- pr_territories: Territory configs per client (market data, seeds, signals)
-- ============================================================================
CREATE TABLE pr_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  client_id UUID NOT NULL REFERENCES pr_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country_code TEXT,
  language TEXT DEFAULT 'en',
  market_data JSONB DEFAULT '{}',
  signal_keywords TEXT[] DEFAULT '{}',
  seed_outlets JSONB DEFAULT '[]',
  seasonal_calendar JSONB DEFAULT '{}',
  pitch_norms TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- pr_runs: Pipeline run metadata
-- ============================================================================
CREATE TABLE pr_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  client_id UUID NOT NULL REFERENCES pr_clients(id) ON DELETE CASCADE,
  territory_id UUID REFERENCES pr_territories(id) ON DELETE SET NULL,
  vps_job_id UUID REFERENCES vps_jobs(id) ON DELETE SET NULL,

  status TEXT DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'RESEARCH', 'GATE_A', 'VERIFICATION', 'GATE_B',
    'QA_LOOP', 'GATE_C', 'EMAIL_GEN', 'COMPLETED', 'FAILED', 'CANCELLED'
  )),
  current_stage INT DEFAULT 0,

  search_queries TEXT[] DEFAULT '{}',
  max_outlets INT DEFAULT 50,

  outlets_discovered INT DEFAULT 0,
  outlets_verified INT DEFAULT 0,
  outlets_qa_passed INT DEFAULT 0,
  emails_generated INT DEFAULT 0,
  emails_approved INT DEFAULT 0,

  total_cost_usd NUMERIC(10,4) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  error_log JSONB DEFAULT '[]',
  stage_results JSONB DEFAULT '{}'
);

-- ============================================================================
-- pr_outlets: Discovered media outlets with verification and QA data
-- ============================================================================
CREATE TABLE pr_outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  run_id UUID REFERENCES pr_runs(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES pr_clients(id) ON DELETE CASCADE,

  outlet_code TEXT NOT NULL,
  name TEXT NOT NULL,
  outlet_type TEXT CHECK (outlet_type IN (
    'newspaper', 'magazine', 'tv', 'radio', 'podcast', 'blog',
    'trade_publication', 'wire_service', 'youtube', 'online_media', 'other'
  )),
  url TEXT,
  country TEXT,
  language TEXT,

  description TEXT,
  audience_size TEXT,
  topics TEXT[] DEFAULT '{}',
  relevance_score INT DEFAULT 0 CHECK (relevance_score BETWEEN 0 AND 100),
  research_data JSONB DEFAULT '{}',

  verification_status TEXT DEFAULT 'PENDING' CHECK (verification_status IN (
    'PENDING', 'VERIFIED', 'FAILED', 'SKIPPED'
  )),
  verification_criteria JSONB DEFAULT '{}',
  verification_score INT DEFAULT 0,

  contact_name TEXT,
  contact_email TEXT,
  contact_role TEXT,
  contact_confidence INT,
  contact_source TEXT CHECK (contact_source IN ('hunter', 'manual', 'website', 'linkedin')),

  qa_status TEXT DEFAULT 'PENDING' CHECK (qa_status IN (
    'PENDING', 'PASSED', 'FAILED', 'NEEDS_REVIEW', 'RE_EVALUATED'
  )),
  qa_notes TEXT,
  qa_score INT DEFAULT 0,

  pipeline_stage TEXT DEFAULT 'DISCOVERED' CHECK (pipeline_stage IN (
    'DISCOVERED', 'VERIFIED', 'QA_PASSED', 'EMAIL_DRAFTED',
    'EMAIL_APPROVED', 'SENT', 'REPLIED', 'EXCLUDED'
  )),

  is_global BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX pr_outlets_code_client ON pr_outlets(client_id, outlet_code) WHERE pipeline_stage != 'EXCLUDED';
CREATE INDEX pr_outlets_run ON pr_outlets(run_id);
CREATE INDEX pr_outlets_pipeline ON pr_outlets(user_id, pipeline_stage);
CREATE INDEX pr_outlets_verification ON pr_outlets(verification_status) WHERE verification_status != 'PENDING';
CREATE INDEX pr_outlets_qa ON pr_outlets(qa_status) WHERE qa_status != 'PENDING';

-- ============================================================================
-- pr_email_drafts: Generated pitch emails pending human review
-- ============================================================================
CREATE TABLE pr_email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  run_id UUID NOT NULL REFERENCES pr_runs(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES pr_outlets(id) ON DELETE CASCADE,

  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  pitch_angle TEXT,
  personalization_hooks JSONB DEFAULT '[]',

  status TEXT DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'APPROVED', 'REJECTED', 'SENT', 'REVISED'
  )),
  reviewer_notes TEXT,
  revision_count INT DEFAULT 0,

  model_used TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  generation_cost_usd NUMERIC(10,6) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX pr_email_drafts_run ON pr_email_drafts(run_id);
CREATE INDEX pr_email_drafts_status ON pr_email_drafts(user_id, status);

-- ============================================================================
-- pr_cost_events: Per-API-call cost tracking
-- ============================================================================
CREATE TABLE pr_cost_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  run_id UUID REFERENCES pr_runs(id) ON DELETE SET NULL,
  outlet_id UUID REFERENCES pr_outlets(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL CHECK (service_name IN (
    'anthropic', 'tavily', 'youtube_data', 'hunter', 'exa', 'other'
  )),
  operation TEXT,
  credits_used NUMERIC(10,4) DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX pr_cost_events_run ON pr_cost_events(run_id);
CREATE INDEX pr_cost_events_service ON pr_cost_events(user_id, service_name, created_at);

-- ============================================================================
-- pr_feedback: Cross-run learning data
-- ============================================================================
CREATE TABLE pr_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  client_id UUID NOT NULL REFERENCES pr_clients(id) ON DELETE CASCADE,
  run_id UUID REFERENCES pr_runs(id) ON DELETE SET NULL,
  outlet_id UUID REFERENCES pr_outlets(id) ON DELETE SET NULL,

  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'outlet_quality', 'email_tone', 'angle_effectiveness',
    'contact_accuracy', 'market_insight', 'general'
  )),
  feedback_text TEXT NOT NULL,
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  applied_to_future_runs BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX pr_feedback_client ON pr_feedback(client_id);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE pr_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_cost_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_feedback ENABLE ROW LEVEL SECURITY;

-- Owner policies
CREATE POLICY "owner_all" ON pr_clients FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON pr_territories FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON pr_runs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON pr_outlets FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON pr_email_drafts FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON pr_cost_events FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON pr_feedback FOR ALL USING (user_id = auth.uid());

-- Service role policies (for VPS worker)
CREATE POLICY "service_all" ON pr_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON pr_outlets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON pr_email_drafts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON pr_cost_events FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION pr_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pr_clients_updated_at BEFORE UPDATE ON pr_clients
  FOR EACH ROW EXECUTE FUNCTION pr_update_timestamp();
CREATE TRIGGER pr_territories_updated_at BEFORE UPDATE ON pr_territories
  FOR EACH ROW EXECUTE FUNCTION pr_update_timestamp();
CREATE TRIGGER pr_outlets_updated_at BEFORE UPDATE ON pr_outlets
  FOR EACH ROW EXECUTE FUNCTION pr_update_timestamp();
CREATE TRIGGER pr_email_drafts_updated_at BEFORE UPDATE ON pr_email_drafts
  FOR EACH ROW EXECUTE FUNCTION pr_update_timestamp();

-- ============================================================================
-- Seed: Agent team template
-- ============================================================================
INSERT INTO agent_team_templates (slug, name, description, icon, phases, is_active)
VALUES (
  'pr-outreach',
  'PR Outreach',
  'AI-powered PR media outreach - discover outlets, verify contacts, quality-check, and generate personalized pitch emails',
  'megaphone',
  '[
    {"name": "Research Discovery", "skill_slug": "pr:research"},
    {"name": "Review Discovered Outlets", "is_gate": true},
    {"name": "Verification & Contact Discovery", "skill_slug": "pr:verify"},
    {"name": "Review Verified Outlets", "is_gate": true},
    {"name": "QA Loop", "skill_slug": "pr:qa"},
    {"name": "Review QA Results", "is_gate": true},
    {"name": "Email Generation", "skill_slug": "pr:email_gen"},
    {"name": "Review & Approve Emails", "is_gate": true}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;
