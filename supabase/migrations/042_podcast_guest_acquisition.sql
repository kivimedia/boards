-- Migration 042: Podcast Guest Acquisition Module
-- Adds tables for the PGA pipeline: candidates, email sequences, agent runs.
-- Registers Scout and Outreach as agent skills.

-- ============================================================================
-- 1. CANDIDATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pga_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  one_liner TEXT,
  email TEXT,
  email_verified BOOLEAN DEFAULT false,
  platform_presence JSONB DEFAULT '{}',
  evidence_of_paid_work JSONB DEFAULT '[]',
  estimated_reach JSONB DEFAULT '{}',
  tools_used TEXT[] DEFAULT '{}',
  contact_method TEXT DEFAULT 'email',
  scout_confidence TEXT CHECK (scout_confidence IN ('high', 'medium', 'low')),
  source JSONB DEFAULT '{}',
  status TEXT DEFAULT 'scouted' CHECK (status IN (
    'scouted', 'approved', 'outreach_active', 'replied',
    'scheduled', 'interviewed', 'rejected'
  )),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pga_candidates_status ON pga_candidates (status);
CREATE INDEX IF NOT EXISTS idx_pga_candidates_confidence ON pga_candidates (scout_confidence);
CREATE INDEX IF NOT EXISTS idx_pga_candidates_email ON pga_candidates (email) WHERE email IS NOT NULL;

-- ============================================================================
-- 2. EMAIL SEQUENCES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pga_email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES pga_candidates(id) ON DELETE CASCADE,
  instantly_campaign_id TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'stopped')),
  emails JSONB DEFAULT '[]',
  -- Each email: { step, subject, body, sent_at, opened_at, clicked_at }
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pga_email_sequences_candidate ON pga_email_sequences (candidate_id);
CREATE INDEX IF NOT EXISTS idx_pga_email_sequences_status ON pga_email_sequences (status);

-- ============================================================================
-- 3. AGENT RUNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pga_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL CHECK (agent_type IN ('scout', 'outreach')),
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  started_by UUID REFERENCES profiles(id),
  candidates_found INTEGER DEFAULT 0,
  emails_created INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  output_json JSONB DEFAULT '{}',
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_pga_agent_runs_type ON pga_agent_runs (agent_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pga_agent_runs_status ON pga_agent_runs (status) WHERE status = 'running';

-- ============================================================================
-- 4. INTEGRATION CONFIGS (API keys for external services)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pga_integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL UNIQUE CHECK (service IN ('instantly', 'hunter', 'snov', 'calendly')),
  api_key_encrypted TEXT,
  config JSONB DEFAULT '{}',
  -- instantly: { sender_email, daily_limit, warmup_enabled }
  -- hunter: {}
  -- snov: {}
  -- calendly: { webhook_url, scheduling_link }
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 5. REGISTER SCOUT + OUTREACH AS AGENT SKILLS
-- ============================================================================

INSERT INTO agent_skills (slug, name, description, category, pack, system_prompt, quality_tier, quality_score, quality_notes, strengths, weaknesses, improvement_suggestions, supported_tools, required_context, output_format, estimated_tokens, icon, color, sort_order, is_active)
VALUES
  (
    'podcast-scout',
    'Podcast Guest Scout',
    'Finds potential podcast guests who are actively making money from vibe coding — freelancers, agency owners, and builders using AI coding tools for paid client work.',
    'strategy',
    'custom',
    E'You are a Podcast Guest Scout for the Vibe Coding Deals podcast (vibecodingdeals.co).\n\nYour mission: Find people who are ACTIVELY MAKING MONEY from vibe coding — not educators, not tool reviewers, but freelancers, agency owners, consultants, and builders who use AI coding tools (Lovable, Cursor, Replit, Claude Code, Bolt, etc.) to deliver PAID client work or sell their own products.\n\nFor each candidate, provide:\n- name: Full name\n- one_liner: Single compelling sentence about why they''re interesting (this is the PRIMARY review field)\n- platform_presence: LinkedIn URL, YouTube, Twitter/X, personal site, Reddit profile\n- evidence_of_paid_work: Specific projects/clients/products they''ve shipped with vibe coding\n- estimated_reach: Follower/subscriber counts per platform\n- tools_used: Which AI coding tools they use\n- email: Best email found (via Hunter.io, Snov.io, website, LinkedIn)\n- contact_method: Best channel (email, linkedin_dm, twitter_dm)\n- scout_confidence: high/medium/low\n- source: Which search channel + specific query/URL where you found them\n\nQuality filters:\n- MUST have evidence of paid work (not just tutorials or experiments)\n- Prefer people with under 50K followers (more likely to say yes)\n- Look for recent activity (within last 3 months)\n- Skip anyone who already appeared on a major podcast\n\nSearch channels: LinkedIn, Google, YouTube, Reddit (r/vibecoding, r/SideProject, r/SaaS, r/Entrepreneur)',
    'solid',
    65,
    'New skill — needs tuning after first batch of real scouts',
    ARRAY['Multi-platform search', 'Evidence-based filtering', 'Structured output'],
    ARRAY['Needs API access for email discovery', 'LinkedIn scraping limitations'],
    ARRAY['Add Sales Navigator integration', 'Build dedup against existing candidates'],
    ARRAY['web_search', 'web_fetch'],
    ARRAY['podcast_brief', 'target_audience'],
    'json',
    4000,
    '🎙️',
    '#8b5cf6',
    100,
    true
  ),
  (
    'podcast-outreach',
    'Podcast Guest Outreach',
    'Writes hyper-personalized email sequences for approved podcast guest candidates, referencing their specific vibe coding projects and achievements.',
    'content',
    'custom',
    E'You are a Podcast Outreach Writer for the Vibe Coding Deals podcast.\n\nYour job: Write hyper-personalized email sequences that make potential guests WANT to come on the show. Generic outreach gets ignored — every email must reference something SPECIFIC about the candidate.\n\nBefore writing emails, RESEARCH the candidate:\n- Read their latest blog posts, tweets, YouTube descriptions\n- Identify 2-3 specific projects they shipped with vibe coding\n- Note recent wins, milestones, or public statements\n- Find a unique angle for the personal invitation\n\nEmail sequence (3-5 emails via Instantly.io):\n1. Day 0 — The Invitation (max 150 words): Specific compliment + real project reference + clear ask\n2. Day 3 — The Value Add (max 100 words): Why their story resonates with the audience\n3. Day 7 — The Social Proof (max 80 words): Other guests or podcast angle\n4. Day 12 — The Gentle Nudge (max 60 words): Short and casual\n5. Day 18 — The Breakup (max 50 words): Friendly close, door stays open\n\nPERSONALIZATION REQUIREMENTS (at least one per email):\n- Specific project name they shipped\n- Tool they''re known for using\n- Quote/paraphrase from their content\n- Reference to platform where work was featured\n\nGeneric compliments without specifics are NOT acceptable. If you can''t find enough specifics, flag for manual outreach instead.\n\nOutput format: JSON array of { step, day, subject, body } objects.\nInclude scheduling link: kivimedia.com/15?ref=CANDIDATE_ID',
    'solid',
    60,
    'New skill — personalization quality needs validation on real sends',
    ARRAY['Hyper-personalized copy', 'Multi-step sequences', 'Research-first approach'],
    ARRAY['Depends on Scout output quality', 'Needs Instantly.io integration'],
    ARRAY['A/B test subject lines', 'Add reply detection handling'],
    ARRAY['web_search', 'web_fetch'],
    ARRAY['candidate_profile', 'podcast_brief'],
    'json',
    3000,
    '✉️',
    '#3b82f6',
    101,
    true
  )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE pga_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pga_email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE pga_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pga_integration_configs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all PGA data
CREATE POLICY "pga_candidates_select" ON pga_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "pga_candidates_insert" ON pga_candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pga_candidates_update" ON pga_candidates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "pga_candidates_delete" ON pga_candidates FOR DELETE TO authenticated USING (true);

CREATE POLICY "pga_email_sequences_select" ON pga_email_sequences FOR SELECT TO authenticated USING (true);
CREATE POLICY "pga_email_sequences_insert" ON pga_email_sequences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pga_email_sequences_update" ON pga_email_sequences FOR UPDATE TO authenticated USING (true);

CREATE POLICY "pga_agent_runs_select" ON pga_agent_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "pga_agent_runs_insert" ON pga_agent_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pga_agent_runs_update" ON pga_agent_runs FOR UPDATE TO authenticated USING (true);

CREATE POLICY "pga_integration_configs_select" ON pga_integration_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "pga_integration_configs_insert" ON pga_integration_configs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pga_integration_configs_update" ON pga_integration_configs FOR UPDATE TO authenticated USING (true);
