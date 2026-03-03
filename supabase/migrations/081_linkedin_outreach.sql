-- LinkedIn Outreach Agent Team
-- Multi-agent system for LinkedIn lead discovery, qualification, and outreach

-- ============================================================================
-- li_settings: Global configuration for the outreach system
-- ============================================================================
CREATE TABLE li_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  warmup_week INT DEFAULT 1,
  daily_send_limit INT DEFAULT 5,
  weekly_send_limit INT DEFAULT 25,
  budget_cap_usd NUMERIC(10,2) DEFAULT 100.00,
  budget_alert_pct INT DEFAULT 80,
  shadow_mode BOOLEAN DEFAULT true,
  dry_run_mode BOOLEAN DEFAULT false,
  auto_generate_batches BOOLEAN DEFAULT false,
  pause_outreach BOOLEAN DEFAULT false,
  pause_reason TEXT,
  slack_webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- ============================================================================
-- li_batches: Import batch tracking
-- ============================================================================
CREATE TABLE li_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'paste', 'scout_wizard', 'manual', 'sales_navigator')),
  source_file TEXT,
  total_imported INT DEFAULT 0,
  duplicates_found INT DEFAULT 0,
  qualified_count INT DEFAULT 0,
  disqualified_count INT DEFAULT 0,
  needs_review_count INT DEFAULT 0,
  cost_total_usd NUMERIC(10,4) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- li_leads: Core lead table
-- ============================================================================
CREATE TABLE li_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  batch_id UUID REFERENCES li_batches(id),

  -- Identity
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  linkedin_url TEXT,
  email TEXT,
  email_source TEXT CHECK (email_source IN ('import', 'hunter', 'snov', 'serpapi', 'manual')),
  email_verified BOOLEAN DEFAULT false,

  -- Company
  company_name TEXT,
  job_position TEXT,
  company_url TEXT,
  website TEXT,
  website_source TEXT CHECK (website_source IN ('import', 'hunter', 'snov', 'serpapi', 'manual')),
  website_confidence TEXT CHECK (website_confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  website_copyright_year INT,
  website_validated BOOLEAN DEFAULT false,

  -- Location
  country TEXT,
  city TEXT,
  state TEXT,

  -- LinkedIn
  connection_degree INT,
  connections_count INT,

  -- Qualification
  qualification_status TEXT DEFAULT 'pending' CHECK (qualification_status IN ('pending', 'qualified', 'disqualified', 'needs_review')),
  disqualification_reason TEXT,
  growth_stage TEXT CHECK (growth_stage IN ('early', 'growing', 'established')),
  lead_score INT DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  score_breakdown JSONB DEFAULT '{}',
  is_competitor BOOLEAN DEFAULT false,
  competitor_type TEXT,

  -- Pipeline
  pipeline_stage TEXT DEFAULT 'TO_ENRICH' CHECK (pipeline_stage IN (
    'TO_ENRICH', 'ENRICHING', 'TO_QUALIFY', 'QUALIFYING',
    'TO_SEND_CONNECTION', 'CONNECTION_SENT', 'CONNECTED',
    'MESSAGE_SENT', 'NUDGE_SENT',
    'LOOM_PERMISSION', 'LOOM_SENT', 'REPLIED',
    'BOOKED', 'NOT_INTERESTED', 'COLD_CONNECTION',
    'FROZEN', 'PERMANENTLY_COLD'
  )),

  -- Outreach tracking
  template_variant TEXT CHECK (template_variant IN ('A', 'B')),
  rotation_variant INT,
  test_group TEXT CHECK (test_group IN ('control', 'test')),
  loom_consent BOOLEAN DEFAULT false,
  loom_response_positive BOOLEAN,
  followup_count_at_stage INT DEFAULT 0,
  re_engagement_count INT DEFAULT 0,
  previously_engaged BOOLEAN DEFAULT false,
  session_attended BOOLEAN,
  last_contacted_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,

  -- Enrichment
  enrichment_tier INT DEFAULT 0,
  enrichment_data JSONB DEFAULT '{}',

  -- Notes
  notes TEXT,

  -- Soft delete
  deleted_at TIMESTAMPTZ,
  purge_after TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX li_leads_linkedin_url_user ON li_leads(user_id, linkedin_url) WHERE linkedin_url IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX li_leads_pipeline_stage ON li_leads(user_id, pipeline_stage) WHERE deleted_at IS NULL;
CREATE INDEX li_leads_qualification ON li_leads(user_id, qualification_status) WHERE deleted_at IS NULL;
CREATE INDEX li_leads_batch ON li_leads(batch_id);
CREATE INDEX li_leads_score ON li_leads(user_id, lead_score DESC) WHERE deleted_at IS NULL;
CREATE INDEX li_leads_deleted ON li_leads(user_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- li_jobs: Orchestrator job queue
-- ============================================================================
CREATE TABLE li_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  job_type TEXT NOT NULL CHECK (job_type IN (
    'SCOUT_IMPORT', 'SCOUT_ENRICH', 'QUALIFY',
    'GENERATE_OUTREACH', 'FOLLOW_UP_CHECK',
    'RECOVERY', 'FEEDBACK_COLLECT',
    'AB_EVALUATE', 'PURGE_TRASH'
  )),
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  payload JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  priority INT DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  locked_by TEXT,
  lock_expires_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX li_jobs_status ON li_jobs(status, priority) WHERE status = 'PENDING';
CREATE INDEX li_jobs_user ON li_jobs(user_id, created_at DESC);

-- ============================================================================
-- li_cost_events: Per-API-call cost logging
-- ============================================================================
CREATE TABLE li_cost_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  lead_id UUID REFERENCES li_leads(id),
  batch_id UUID REFERENCES li_batches(id),
  service_name TEXT NOT NULL CHECK (service_name IN ('hunter', 'snov', 'serpapi', 'anthropic', 'scrapling')),
  operation TEXT,
  credits_used NUMERIC(10,4) DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX li_cost_events_batch ON li_cost_events(batch_id);
CREATE INDEX li_cost_events_service ON li_cost_events(user_id, service_name, created_at);

-- ============================================================================
-- li_failed_leads: Error quarantine
-- ============================================================================
CREATE TABLE li_failed_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  lead_id UUID NOT NULL REFERENCES li_leads(id),
  error_type TEXT NOT NULL CHECK (error_type IN ('API_FAILURE', 'VALIDATION_ERROR', 'TIMEOUT', 'RATE_LIMIT')),
  error_message TEXT,
  failed_tier INT,
  retry_count INT DEFAULT 0,
  recovery_attempts INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  status TEXT DEFAULT 'PENDING_RETRY' CHECK (status IN ('PENDING_RETRY', 'EXHAUSTED', 'RESOLVED')),
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX li_failed_leads_retry ON li_failed_leads(status, next_retry_at) WHERE status = 'PENDING_RETRY';

-- ============================================================================
-- li_pipeline_events: Stage transition audit log
-- ============================================================================
CREATE TABLE li_pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES li_leads(id),
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('scout', 'qualifier', 'outreach', 'orchestrator', 'manual')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX li_pipeline_events_lead ON li_pipeline_events(lead_id, created_at);

-- ============================================================================
-- li_templates: Message templates with A/B variants
-- ============================================================================
CREATE TABLE li_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  template_number INT NOT NULL,
  stage TEXT NOT NULL,
  variant TEXT DEFAULT 'A' CHECK (variant IN ('A', 'B')),
  template_text TEXT NOT NULL,
  prerequisite JSONB DEFAULT '{}',
  max_length INT,
  is_followup BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, template_number, variant)
);

-- ============================================================================
-- li_rotation_variants: Template 1 rotation texts for anti-detection
-- ============================================================================
CREATE TABLE li_rotation_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  variant_number INT NOT NULL,
  template_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, variant_number)
);

-- ============================================================================
-- li_outreach_messages: Generated messages per lead
-- ============================================================================
CREATE TABLE li_outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES li_leads(id),
  template_id UUID REFERENCES li_templates(id),
  template_number INT,
  variant TEXT,
  rotation_variant INT,
  message_text TEXT NOT NULL,
  quality_check JSONB DEFAULT '{}',
  quality_passed BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'failed', 'dry_run')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX li_outreach_messages_lead ON li_outreach_messages(lead_id, created_at);

-- ============================================================================
-- li_daily_batches: Daily send queues
-- ============================================================================
CREATE TABLE li_daily_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  target_date DATE NOT NULL,
  lead_ids UUID[] DEFAULT '{}',
  batch_size INT DEFAULT 0,
  approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  is_dry_run BOOLEAN DEFAULT false,
  warmup_week INT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'sent', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, target_date)
);

-- ============================================================================
-- li_ab_tests: A/B test config and results
-- ============================================================================
CREATE TABLE li_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  template_number INT NOT NULL,
  template_stage TEXT NOT NULL,
  variant_a_id UUID REFERENCES li_templates(id),
  variant_b_id UUID REFERENCES li_templates(id),
  sample_a INT DEFAULT 0,
  sample_b INT DEFAULT 0,
  conversions_a INT DEFAULT 0,
  conversions_b INT DEFAULT 0,
  rate_a NUMERIC(5,4) DEFAULT 0,
  rate_b NUMERIC(5,4) DEFAULT 0,
  p_value NUMERIC(6,5),
  confidence_met BOOLEAN DEFAULT false,
  consecutive_wins INT DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'winner_a', 'winner_b', 'no_winner', 'insufficient_data', 'paused')),
  started_at TIMESTAMPTZ DEFAULT now(),
  last_evaluated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- li_qualification_overrides: Manual corrections
-- ============================================================================
CREATE TABLE li_qualification_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  lead_id UUID NOT NULL REFERENCES li_leads(id),
  original_decision TEXT NOT NULL,
  new_decision TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX li_qualification_overrides_lead ON li_qualification_overrides(lead_id);

-- ============================================================================
-- li_learning_log: Self-improvement proposals
-- ============================================================================
CREATE TABLE li_learning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  change_type TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence TEXT,
  impact TEXT,
  status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'rolled_back')),
  approved_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  rollback_reason TEXT,
  snapshot_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- li_rule_snapshots: Config snapshots for rollback
-- ============================================================================
CREATE TABLE li_rule_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  version INT NOT NULL,
  config_json JSONB NOT NULL,
  learning_log_id UUID REFERENCES li_learning_log(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- RLS Policies
-- ============================================================================
ALTER TABLE li_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_cost_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_failed_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_pipeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_rotation_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_daily_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_qualification_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_learning_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_rule_snapshots ENABLE ROW LEVEL SECURITY;

-- Owner policies (Ziv can read/write everything)
CREATE POLICY "owner_all" ON li_settings FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_batches FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_leads FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_jobs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_cost_events FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_failed_leads FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_templates FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_rotation_variants FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_daily_batches FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_ab_tests FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_qualification_overrides FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_learning_log FOR ALL USING (user_id = auth.uid());
CREATE POLICY "owner_all" ON li_rule_snapshots FOR ALL USING (user_id = auth.uid());

-- Pipeline events read via lead ownership
CREATE POLICY "owner_read" ON li_pipeline_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM li_leads WHERE li_leads.id = li_pipeline_events.lead_id AND li_leads.user_id = auth.uid()));
CREATE POLICY "owner_insert" ON li_pipeline_events FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM li_leads WHERE li_leads.id = li_pipeline_events.lead_id AND li_leads.user_id = auth.uid()));

-- Outreach messages read via lead ownership
CREATE POLICY "owner_read" ON li_outreach_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM li_leads WHERE li_leads.id = li_outreach_messages.lead_id AND li_leads.user_id = auth.uid()));
CREATE POLICY "owner_insert" ON li_outreach_messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM li_leads WHERE li_leads.id = li_outreach_messages.lead_id AND li_leads.user_id = auth.uid()));

-- Service role policies (for VPS worker / Edge Functions)
CREATE POLICY "service_all" ON li_leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON li_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON li_cost_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON li_failed_leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON li_pipeline_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON li_outreach_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON li_learning_log FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Seed: Agent team template
-- ============================================================================
INSERT INTO agent_team_templates (slug, name, description, icon, phases, is_active)
VALUES (
  'linkedin-outreach',
  'LinkedIn Outreach',
  'Automated LinkedIn lead discovery, qualification, and outreach sequence for magicians and kids entertainers',
  'linkedin',
  '[
    {"name": "Import Leads", "skill_slug": "li:scout_import"},
    {"name": "Enrich & Validate", "skill_slug": "li:enrich_batch"},
    {"name": "Review Enrichment", "is_gate": true},
    {"name": "Qualify & Score", "skill_slug": "li:qualify_batch"},
    {"name": "Review Qualification", "is_gate": true},
    {"name": "Generate Messages", "skill_slug": "li:generate_messages"},
    {"name": "Review Messages", "is_gate": true},
    {"name": "Daily Batch Send", "skill_slug": "li:send_daily_batch"}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- Seed: Default message templates (10 templates from PRD)
-- These use a placeholder user_id that should be updated on first setup
-- ============================================================================

-- Function to seed templates for a user
CREATE OR REPLACE FUNCTION li_seed_templates(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- T1: Connection Note (300 char limit)
  INSERT INTO li_templates (user_id, template_number, stage, variant, template_text, max_length, is_followup)
  VALUES (p_user_id, 1, 'TO_SEND_CONNECTION', 'A',
    'Hi {{First Name}}! I noticed you''re a {{Position}} based in the US and thought I''d reach out and connect. Always great to meet people in the entertainment space!',
    300, false)
  ON CONFLICT (user_id, template_number, variant) DO NOTHING;

  -- T2: Loom Permission
  INSERT INTO li_templates (user_id, template_number, stage, variant, template_text, is_followup)
  VALUES (p_user_id, 2, 'CONNECTED', 'A',
    'Thanks for connecting, {{First Name}}! I took a quick look at your website and had a few thoughts on how it might improve conversions. Would you be open to me sending a short, personalized Loom video with a couple of ideas? It''s completely free. Just let me know.',
    false)
  ON CONFLICT (user_id, template_number, variant) DO NOTHING;

  -- T3: Loom Delivery
  INSERT INTO li_templates (user_id, template_number, stage, variant, template_text, is_followup,
    prerequisite)
  VALUES (p_user_id, 3, 'LOOM_PERMISSION', 'A',
    'Hi {{First Name}}, here''s that Loom I mentioned: [Insert Loom Link]. I kept it short and focused on a few things I think could make a real difference for your site. Hope it''s useful. Ziv',
    false, '{"loom_consent": true}'::jsonb)
  ON CONFLICT (user_id, template_number, variant) DO NOTHING;

  -- T4: Loom Follow-up
  INSERT INTO li_templates (user_id, template_number, stage, variant, template_text, is_followup,
    prerequisite)
  VALUES (p_user_id, 4, 'LOOM_SENT', 'A',
    'Hey {{First Name}}, just checking in. Did you get a chance to watch that Loom? Curious what you thought. Ziv',
    true, '{"days_since_loom": 2}'::jsonb)
  ON CONFLICT (user_id, template_number, variant) DO NOTHING;

  -- T5: Strategy Session
  INSERT INTO li_templates (user_id, template_number, stage, variant, template_text, is_followup,
    prerequisite)
  VALUES (p_user_id, 5, 'REPLIED', 'A',
    'Glad you found it helpful, {{First Name}}. If you''d like, I''m happy to walk through some of those ideas in more detail on a quick call. Totally complimentary, no strings. Let me know if that sounds good. Ziv',
    false, '{"loom_response_positive": true}'::jsonb)
  ON CONFLICT (user_id, template_number, variant) DO NOTHING;

  -- T6: Follow-up Permission (1st)
  INSERT INTO li_templates (user_id, template_number, stage, variant, template_text, is_followup,
    prerequisite)
  VALUES (p_user_id, 6, 'MESSAGE_SENT', 'A',
    'Hey {{First Name}}, just floating this back up in case it got buried. Happy to send over that Loom walkthrough if you''re still interested. No pressure either way!',
    true, '{"days_since_message": 4, "followup_count_lt": 2}'::jsonb)
  ON CONFLICT (user_id, template_number, variant) DO NOTHING;

  -- T7: Follow-up Permission (2nd)
  INSERT INTO li_templates (user_id, template_number, stage, variant, template_text, is_followup,
    prerequisite)
  VALUES (p_user_id, 7, 'NUDGE_SENT', 'A',
    'Hi {{First Name}}, last quick note on this. If the timing isn''t right, totally understand. The offer stands if things change down the road. Ziv',
    true, '{"days_since_nudge": 4, "followup_count_lt": 2}'::jsonb)
  ON CONFLICT (user_id, template_number, variant) DO NOTHING;

  -- T8: Follow-up Loom (1st)
  INSERT INTO li_templates (user_id, template_number, stage, variant, template_text, is_followup,
    prerequisite)
  VALUES (p_user_id, 8, 'LOOM_SENT', 'A',
    'Hi {{First Name}}, I know things get busy. That Loom is still there whenever you have a few minutes. No rush at all. Ziv',
    true, '{"days_since_loom": 4, "followup_count_lt": 2}'::jsonb)
  ON CONFLICT (user_id, template_number, variant) DO NOTHING;

  -- T9: No-Show Reschedule
  INSERT INTO li_templates (user_id, template_number, stage, variant, template_text, is_followup,
    prerequisite)
  VALUES (p_user_id, 9, 'BOOKED', 'A',
    'Hey {{First Name}}, looks like we missed each other. No worries at all. Want to find another time that works better? Ziv',
    true, '{"session_attended": false, "days_since_session": 1}'::jsonb)
  ON CONFLICT (user_id, template_number, variant) DO NOTHING;

  -- T10: Re-engagement
  INSERT INTO li_templates (user_id, template_number, stage, variant, template_text, is_followup,
    prerequisite)
  VALUES (p_user_id, 10, 'NOT_INTERESTED', 'A',
    'Hi {{First Name}}, hope things are going well with the business. I had a couple of new ideas since we last connected that might be relevant for your site. Let me know if you''d like me to share them. Ziv',
    true, '{"days_since_cold": 21, "previously_engaged": true, "re_engagement_count": 0}'::jsonb)
  ON CONFLICT (user_id, template_number, variant) DO NOTHING;

  -- Rotation variants for T1
  INSERT INTO li_rotation_variants (user_id, variant_number, template_text)
  VALUES
    (p_user_id, 1, 'Hi {{First Name}}! I noticed you''re a {{Position}} based in the US and thought I''d reach out and connect. Always great to meet people in the entertainment space!'),
    (p_user_id, 2, 'Hey {{First Name}}, saw you''re working as a {{Position}} and wanted to say hello. Love connecting with folks in the entertainment world.'),
    (p_user_id, 3, 'Hi {{First Name}}! Fellow fan of the entertainment industry here. Noticed your work as a {{Position}} and thought we should connect.')
  ON CONFLICT (user_id, variant_number) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION li_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER li_leads_updated_at BEFORE UPDATE ON li_leads
  FOR EACH ROW EXECUTE FUNCTION li_update_timestamp();

CREATE TRIGGER li_settings_updated_at BEFORE UPDATE ON li_settings
  FOR EACH ROW EXECUTE FUNCTION li_update_timestamp();

CREATE TRIGGER li_templates_updated_at BEFORE UPDATE ON li_templates
  FOR EACH ROW EXECUTE FUNCTION li_update_timestamp();
