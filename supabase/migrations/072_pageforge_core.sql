-- ============================================================================
-- 072: PageForge Core Tables
-- Multi-agent Figma-to-WordPress page build system
-- ============================================================================

-- PageForge build status enum
CREATE TYPE pageforge_build_status AS ENUM (
  'pending',
  'preflight',
  'figma_analysis',
  'section_classification',
  'markup_generation',
  'markup_validation',
  'deploy_draft',
  'image_optimization',
  'vqa_capture',
  'vqa_comparison',
  'vqa_fix_loop',
  'functional_qa',
  'seo_config',
  'report_generation',
  'developer_review_gate',
  'am_signoff_gate',
  'published',
  'failed',
  'cancelled'
);

-- Page builder enum
CREATE TYPE page_builder_type AS ENUM ('gutenberg', 'divi5', 'divi4');

-- Gate decision enum
CREATE TYPE pageforge_gate_decision AS ENUM ('approve', 'revise', 'cancel');

-- ============================================================================
-- Site Profiles - WordPress site configurations
-- ============================================================================
CREATE TABLE pageforge_site_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  site_name TEXT NOT NULL,
  site_url TEXT NOT NULL,

  -- WordPress REST API credentials
  wp_rest_url TEXT NOT NULL,
  wp_username TEXT,
  wp_app_password TEXT,

  -- WordPress SSH credentials (optional)
  wp_ssh_host TEXT,
  wp_ssh_user TEXT,
  wp_ssh_key_path TEXT,

  -- Figma credentials
  figma_personal_token TEXT,
  figma_team_id TEXT,

  -- Builder config
  page_builder page_builder_type NOT NULL DEFAULT 'gutenberg',
  theme_name TEXT,
  theme_css_url TEXT,
  global_css TEXT,

  -- Quality thresholds
  yoast_enabled BOOLEAN NOT NULL DEFAULT true,
  vqa_pass_threshold NUMERIC(5,2) NOT NULL DEFAULT 95.00,
  lighthouse_min_score INTEGER NOT NULL DEFAULT 80,
  max_vqa_fix_loops INTEGER NOT NULL DEFAULT 3,

  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Builds - Individual page build records
-- ============================================================================
CREATE TABLE pageforge_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_profile_id UUID NOT NULL REFERENCES pageforge_site_profiles(id) ON DELETE CASCADE,
  vps_job_id UUID REFERENCES vps_jobs(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Figma source
  figma_file_key TEXT NOT NULL,
  figma_node_ids TEXT[] NOT NULL DEFAULT '{}',
  page_title TEXT NOT NULL,
  page_slug TEXT,
  page_builder page_builder_type NOT NULL DEFAULT 'gutenberg',

  -- Pipeline status
  status pageforge_build_status NOT NULL DEFAULT 'pending',
  current_phase INTEGER NOT NULL DEFAULT 0,
  phase_results JSONB NOT NULL DEFAULT '{}',
  artifacts JSONB NOT NULL DEFAULT '{}',
  error_log JSONB NOT NULL DEFAULT '[]',

  -- WordPress output
  wp_page_id INTEGER,
  wp_draft_url TEXT,
  wp_preview_url TEXT,
  wp_live_url TEXT,

  -- VQA scores
  vqa_score_desktop NUMERIC(5,2),
  vqa_score_tablet NUMERIC(5,2),
  vqa_score_mobile NUMERIC(5,2),
  vqa_score_overall NUMERIC(5,2),

  -- Lighthouse scores
  lighthouse_performance INTEGER,
  lighthouse_accessibility INTEGER,
  lighthouse_best_practices INTEGER,
  lighthouse_seo INTEGER,

  -- QA results
  qa_checks_passed INTEGER NOT NULL DEFAULT 0,
  qa_checks_failed INTEGER NOT NULL DEFAULT 0,
  qa_checks_total INTEGER NOT NULL DEFAULT 0,

  -- Cost tracking
  total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  agent_costs JSONB NOT NULL DEFAULT '{}',

  -- Developer review gate
  dev_gate_decision pageforge_gate_decision,
  dev_gate_feedback TEXT,
  dev_gate_decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  dev_gate_decided_at TIMESTAMPTZ,

  -- AM signoff gate
  am_gate_decision pageforge_gate_decision,
  am_gate_feedback TEXT,
  am_gate_decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  am_gate_decided_at TIMESTAMPTZ,

  -- VQA fix loop tracking
  vqa_fix_iteration INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- ============================================================================
-- Agent Calls - Per-agent call logs for cost tracking and debugging
-- ============================================================================
CREATE TABLE pageforge_agent_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES pageforge_builds(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  phase TEXT NOT NULL,

  -- Model info
  model_used TEXT,
  provider TEXT,

  -- Token usage
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  iteration INTEGER NOT NULL DEFAULT 1,

  -- Previews
  input_preview TEXT,
  output_preview TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Build Phases - Detailed per-phase result records
-- ============================================================================
CREATE TABLE pageforge_build_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES pageforge_builds(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL,
  phase_index INTEGER NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Results
  result JSONB,
  artifacts JSONB,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX idx_pf_site_profiles_client ON pageforge_site_profiles(client_id);
CREATE INDEX idx_pf_builds_site_profile ON pageforge_builds(site_profile_id);
CREATE INDEX idx_pf_builds_client ON pageforge_builds(client_id);
CREATE INDEX idx_pf_builds_status ON pageforge_builds(status);
CREATE INDEX idx_pf_builds_vps_job ON pageforge_builds(vps_job_id);
CREATE INDEX idx_pf_builds_created ON pageforge_builds(created_at DESC);
CREATE INDEX idx_pf_agent_calls_build ON pageforge_agent_calls(build_id);
CREATE INDEX idx_pf_agent_calls_phase ON pageforge_agent_calls(build_id, phase);
CREATE INDEX idx_pf_build_phases_build ON pageforge_build_phases(build_id);

-- ============================================================================
-- RLS Policies (permissive for authenticated users)
-- ============================================================================
ALTER TABLE pageforge_site_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pageforge_builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE pageforge_agent_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE pageforge_build_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage site profiles"
  ON pageforge_site_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage builds"
  ON pageforge_builds FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage agent calls"
  ON pageforge_agent_calls FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage build phases"
  ON pageforge_build_phases FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- Storage bucket for build artifacts (screenshots, diffs, reports)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('pageforge-artifacts', 'pageforge-artifacts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload pageforge artifacts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pageforge-artifacts');

CREATE POLICY "Authenticated users can read pageforge artifacts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pageforge-artifacts');

CREATE POLICY "Authenticated users can delete pageforge artifacts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pageforge-artifacts');
