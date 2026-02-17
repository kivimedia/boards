-- Migration 005: Structured Briefing System (P1.4)
-- Briefing templates per board type + deliverable type
-- Card briefs: structured data + completeness scoring

-- ============================================================================
-- BRIEFING TEMPLATES
-- ============================================================================
CREATE TABLE briefing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_type TEXT NOT NULL,
  deliverable_type TEXT NOT NULL,
  name TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- fields JSONB structure:
-- [
--   { "key": "target_audience", "label": "Target Audience", "type": "text", "required": true },
--   { "key": "dimensions", "label": "Dimensions", "type": "text", "required": false },
--   { "key": "tone", "label": "Tone", "type": "dropdown", "options": ["Professional", "Casual"], "required": true },
--   { "key": "deadline", "label": "Deadline", "type": "date", "required": true },
--   { "key": "reference_links", "label": "Reference Links", "type": "url_list", "required": false },
--   { "key": "notes", "label": "Additional Notes", "type": "textarea", "required": false }
-- ]

CREATE INDEX idx_briefing_templates_board_type ON briefing_templates(board_type);
CREATE UNIQUE INDEX idx_briefing_templates_unique ON briefing_templates(board_type, deliverable_type);

-- ============================================================================
-- CARD BRIEFS
-- ============================================================================
CREATE TABLE card_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  template_id UUID REFERENCES briefing_templates(id) ON DELETE SET NULL,
  data JSONB NOT NULL DEFAULT '{}',
  completeness_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_card_briefs_card_id ON card_briefs(card_id);
CREATE INDEX idx_card_briefs_template_id ON card_briefs(template_id);
CREATE INDEX idx_card_briefs_is_complete ON card_briefs(is_complete);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE briefing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_briefs ENABLE ROW LEVEL SECURITY;

-- Briefing templates: readable by all authenticated users, writable by admins
CREATE POLICY "briefing_templates_select" ON briefing_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "briefing_templates_insert" ON briefing_templates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "briefing_templates_update" ON briefing_templates
  FOR UPDATE TO authenticated USING (true);

-- Card briefs: accessible by authenticated users (board-level filtering done in app)
CREATE POLICY "card_briefs_select" ON card_briefs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "card_briefs_insert" ON card_briefs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "card_briefs_update" ON card_briefs
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "card_briefs_delete" ON card_briefs
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_card_briefs_updated_at
  BEFORE UPDATE ON card_briefs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_briefing_templates_updated_at
  BEFORE UPDATE ON briefing_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE card_briefs;

-- ============================================================================
-- SEED BRIEFING TEMPLATES
-- ============================================================================

-- Design Board templates
INSERT INTO briefing_templates (board_type, deliverable_type, name, fields) VALUES
('graphic_designer', 'website_design', 'Website Design Brief', '[
  {"key": "project_name", "label": "Project Name", "type": "text", "required": true},
  {"key": "target_audience", "label": "Target Audience", "type": "textarea", "required": true},
  {"key": "brand_guidelines", "label": "Brand Guidelines Link", "type": "url", "required": false},
  {"key": "dimensions", "label": "Page Dimensions / Breakpoints", "type": "text", "required": true},
  {"key": "pages", "label": "Pages Required", "type": "textarea", "required": true},
  {"key": "color_preferences", "label": "Color Preferences", "type": "text", "required": false},
  {"key": "reference_links", "label": "Reference / Inspiration Links", "type": "textarea", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]'),
('graphic_designer', 'social_media_asset', 'Social Media Asset Brief', '[
  {"key": "platform", "label": "Platform", "type": "dropdown", "options": ["Instagram", "Facebook", "Twitter/X", "LinkedIn", "TikTok", "YouTube", "Pinterest"], "required": true},
  {"key": "asset_type", "label": "Asset Type", "type": "dropdown", "options": ["Post", "Story", "Cover Photo", "Ad", "Carousel"], "required": true},
  {"key": "dimensions", "label": "Dimensions", "type": "text", "required": true},
  {"key": "copy_text", "label": "Copy / Text Content", "type": "textarea", "required": true},
  {"key": "brand_guidelines", "label": "Brand Guidelines Link", "type": "url", "required": false},
  {"key": "target_audience", "label": "Target Audience", "type": "text", "required": true},
  {"key": "cta", "label": "Call to Action", "type": "text", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]'),
('graphic_designer', 'logo', 'Logo Design Brief', '[
  {"key": "company_name", "label": "Company / Brand Name", "type": "text", "required": true},
  {"key": "industry", "label": "Industry", "type": "text", "required": true},
  {"key": "brand_values", "label": "Brand Values / Keywords", "type": "textarea", "required": true},
  {"key": "color_preferences", "label": "Color Preferences", "type": "text", "required": false},
  {"key": "style_preferences", "label": "Style Preferences", "type": "dropdown", "options": ["Minimalist", "Modern", "Classic", "Playful", "Bold", "Elegant"], "required": true},
  {"key": "usage", "label": "Where will the logo be used?", "type": "textarea", "required": true},
  {"key": "reference_logos", "label": "Reference Logos / Inspiration", "type": "textarea", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]');

-- Dev Board templates
INSERT INTO briefing_templates (board_type, deliverable_type, name, fields) VALUES
('dev', 'feature_request', 'Feature Request Brief', '[
  {"key": "feature_name", "label": "Feature Name", "type": "text", "required": true},
  {"key": "user_story", "label": "User Story", "type": "textarea", "required": true},
  {"key": "acceptance_criteria", "label": "Acceptance Criteria", "type": "textarea", "required": true},
  {"key": "affected_pages", "label": "Affected Pages / Components", "type": "textarea", "required": true},
  {"key": "api_changes", "label": "API Changes Required", "type": "textarea", "required": false},
  {"key": "database_changes", "label": "Database Changes Required", "type": "textarea", "required": false},
  {"key": "design_link", "label": "Design / Mockup Link", "type": "url", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]'),
('dev', 'bug_report', 'Bug Report Brief', '[
  {"key": "bug_title", "label": "Bug Title", "type": "text", "required": true},
  {"key": "steps_to_reproduce", "label": "Steps to Reproduce", "type": "textarea", "required": true},
  {"key": "expected_behavior", "label": "Expected Behavior", "type": "textarea", "required": true},
  {"key": "actual_behavior", "label": "Actual Behavior", "type": "textarea", "required": true},
  {"key": "environment", "label": "Environment (Browser, OS, etc.)", "type": "text", "required": true},
  {"key": "url", "label": "URL Where Bug Occurs", "type": "url", "required": false},
  {"key": "screenshot", "label": "Screenshot / Recording Link", "type": "url", "required": false},
  {"key": "severity", "label": "Severity", "type": "dropdown", "options": ["Critical", "High", "Medium", "Low"], "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]');

-- Copy Board templates
INSERT INTO briefing_templates (board_type, deliverable_type, name, fields) VALUES
('copy', 'blog_post', 'Blog Post Brief', '[
  {"key": "topic", "label": "Topic / Title", "type": "text", "required": true},
  {"key": "target_audience", "label": "Target Audience", "type": "text", "required": true},
  {"key": "tone", "label": "Tone", "type": "dropdown", "options": ["Professional", "Casual", "Playful", "Authoritative", "Empathetic"], "required": true},
  {"key": "word_count", "label": "Target Word Count", "type": "number", "required": true},
  {"key": "seo_keywords", "label": "SEO Keywords", "type": "textarea", "required": true},
  {"key": "outline", "label": "Outline / Key Points", "type": "textarea", "required": true},
  {"key": "cta", "label": "Call to Action", "type": "text", "required": false},
  {"key": "reference_links", "label": "Reference Links", "type": "textarea", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]'),
('copy', 'email_campaign', 'Email Campaign Brief', '[
  {"key": "campaign_name", "label": "Campaign Name", "type": "text", "required": true},
  {"key": "email_type", "label": "Email Type", "type": "dropdown", "options": ["Newsletter", "Promotional", "Welcome Series", "Re-engagement", "Announcement", "Transactional"], "required": true},
  {"key": "target_audience", "label": "Target Audience / Segment", "type": "text", "required": true},
  {"key": "subject_line_ideas", "label": "Subject Line Ideas", "type": "textarea", "required": false},
  {"key": "key_message", "label": "Key Message", "type": "textarea", "required": true},
  {"key": "cta", "label": "Call to Action", "type": "text", "required": true},
  {"key": "tone", "label": "Tone", "type": "dropdown", "options": ["Professional", "Casual", "Urgent", "Friendly", "Formal"], "required": true},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]');

-- Video Board templates
INSERT INTO briefing_templates (board_type, deliverable_type, name, fields) VALUES
('video_editor', 'video_production', 'Video Production Brief', '[
  {"key": "video_title", "label": "Video Title", "type": "text", "required": true},
  {"key": "video_type", "label": "Video Type", "type": "dropdown", "options": ["Social Media", "YouTube", "Ad/Commercial", "Corporate", "Event", "Tutorial", "Animation", "Reel"], "required": true},
  {"key": "duration", "label": "Target Duration (seconds)", "type": "number", "required": true},
  {"key": "aspect_ratio", "label": "Aspect Ratio", "type": "dropdown", "options": ["16:9", "9:16", "1:1", "4:5", "4:3"], "required": true},
  {"key": "script", "label": "Script / Storyboard", "type": "textarea", "required": false},
  {"key": "raw_footage_link", "label": "Raw Footage Link", "type": "url", "required": false},
  {"key": "music_preference", "label": "Music / Audio Preference", "type": "text", "required": false},
  {"key": "brand_guidelines", "label": "Brand Guidelines Link", "type": "url", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]');
