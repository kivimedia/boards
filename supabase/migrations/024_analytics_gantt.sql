-- Migration 024: Analytics, White-Label, Gantt (P3.6)

-- ============================================================================
-- PORTAL BRANDING (White-Label)
-- ============================================================================
CREATE TABLE portal_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#6366f1',
  secondary_color TEXT NOT NULL DEFAULT '#0f172a',
  accent_color TEXT NOT NULL DEFAULT '#faf7f2',
  favicon_url TEXT,
  custom_domain TEXT,
  company_name TEXT,
  footer_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- ============================================================================
-- SATISFACTION SURVEYS
-- ============================================================================
CREATE TABLE satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  survey_type TEXT NOT NULL CHECK (survey_type IN ('delivery', 'milestone', 'periodic')),
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_satisfaction_client ON satisfaction_surveys(client_id);
CREATE INDEX idx_satisfaction_card ON satisfaction_surveys(card_id);

-- ============================================================================
-- CUSTOM REPORTS
-- ============================================================================
CREATE TABLE custom_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL CHECK (report_type IN ('burndown', 'velocity', 'cycle_time', 'workload', 'ai_effectiveness', 'custom')),
  config JSONB NOT NULL DEFAULT '{}',
  -- config: { metrics: [], filters: { board_ids: [], user_ids: [], date_range: {} }, chart_type: 'line'|'bar'|'pie' }
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  schedule TEXT, -- cron-like: 'weekly:monday', 'monthly:1'
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_reports_type ON custom_reports(report_type);
CREATE INDEX idx_custom_reports_creator ON custom_reports(created_by);

-- ============================================================================
-- GANTT DEPENDENCIES (extend card_dependencies for timeline view)
-- ============================================================================
ALTER TABLE cards ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE portal_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE satisfaction_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branding_select" ON portal_branding FOR SELECT TO authenticated USING (true);
CREATE POLICY "branding_insert" ON portal_branding FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "branding_update" ON portal_branding FOR UPDATE TO authenticated USING (true);
CREATE POLICY "branding_delete" ON portal_branding FOR DELETE TO authenticated USING (true);

CREATE POLICY "surveys_select" ON satisfaction_surveys FOR SELECT TO authenticated USING (true);
CREATE POLICY "surveys_insert" ON satisfaction_surveys FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "reports_select" ON custom_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "reports_insert" ON custom_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "reports_update" ON custom_reports FOR UPDATE TO authenticated USING (true);
CREATE POLICY "reports_delete" ON custom_reports FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_portal_branding_updated_at
  BEFORE UPDATE ON portal_branding FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_custom_reports_updated_at
  BEFORE UPDATE ON custom_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
