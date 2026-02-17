-- Migration 012: AI Dev QA (P2.2)
-- QA results tracking, checklist templates, and screenshot-based quality analysis

-- ============================================================================
-- QA CHECKLIST TEMPLATES
-- ============================================================================
CREATE TABLE qa_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- items: [{ "category": "visual", "text": "No text overflow or clipping" }, ...]

-- ============================================================================
-- AI QA RESULTS
-- ============================================================================
CREATE TABLE ai_qa_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  screenshots JSONB NOT NULL DEFAULT '[]',
  results JSONB NOT NULL DEFAULT '{}',
  console_errors JSONB NOT NULL DEFAULT '[]',
  performance_metrics JSONB NOT NULL DEFAULT '{}',
  checklist_template_id UUID REFERENCES qa_checklist_templates(id) ON DELETE SET NULL,
  checklist_results JSONB NOT NULL DEFAULT '[]',
  overall_score INTEGER DEFAULT 0,
  overall_status TEXT NOT NULL DEFAULT 'pending',
  findings_count JSONB NOT NULL DEFAULT '{"critical": 0, "major": 0, "minor": 0, "info": 0}',
  model_used TEXT,
  usage_log_id UUID REFERENCES ai_usage_log(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- overall_status: 'pending', 'running', 'passed', 'failed', 'error'
-- screenshots: [{ "viewport": "desktop", "width": 1920, "height": 1080, "storage_path": "..." }, ...]
-- results: { "findings": [...], "checklist_results": [...], "overall_score": 85, "summary": "..." }
-- console_errors: [{ "type": "error", "text": "...", "url": "...", "line": 0 }]
-- performance_metrics: { "load_time_ms": 1200, "first_paint_ms": 300, "dom_content_loaded_ms": 800 }

CREATE INDEX idx_ai_qa_results_card ON ai_qa_results(card_id);
CREATE INDEX idx_ai_qa_results_status ON ai_qa_results(overall_status);
CREATE INDEX idx_ai_qa_results_created_at ON ai_qa_results(created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE qa_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_qa_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa_checklist_templates_select" ON qa_checklist_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "qa_checklist_templates_insert" ON qa_checklist_templates
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qa_checklist_templates_update" ON qa_checklist_templates
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "qa_checklist_templates_delete" ON qa_checklist_templates
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "ai_qa_results_select" ON ai_qa_results
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_qa_results_insert" ON ai_qa_results
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_qa_results_update" ON ai_qa_results
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ai_qa_results_delete" ON ai_qa_results
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_qa_checklist_templates_updated_at
  BEFORE UPDATE ON qa_checklist_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_ai_qa_results_updated_at
  BEFORE UPDATE ON ai_qa_results FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SEED DEFAULT QA CHECKLIST
-- ============================================================================
INSERT INTO qa_checklist_templates (name, description, is_default, items) VALUES
('Standard Web QA', 'Default QA checklist for web pages and applications', true, '[
  { "category": "visual", "text": "No text overflow or clipping in any viewport" },
  { "category": "visual", "text": "Images load correctly and are properly sized" },
  { "category": "visual", "text": "Consistent spacing and alignment" },
  { "category": "visual", "text": "Colors match brand guidelines" },
  { "category": "visual", "text": "Typography is consistent and readable" },
  { "category": "responsive", "text": "Layout adapts correctly to mobile viewport" },
  { "category": "responsive", "text": "Layout adapts correctly to tablet viewport" },
  { "category": "responsive", "text": "No horizontal scrolling on any viewport" },
  { "category": "interactive", "text": "All buttons and links appear clickable" },
  { "category": "interactive", "text": "Form elements are properly styled and aligned" },
  { "category": "interactive", "text": "Navigation is accessible and functional" },
  { "category": "accessibility", "text": "Sufficient color contrast for text" },
  { "category": "accessibility", "text": "Images have descriptive context" },
  { "category": "performance", "text": "Page loads within acceptable time" },
  { "category": "performance", "text": "No console errors visible" }
]');
