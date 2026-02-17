-- Migration 002: Enhanced Card Model
-- Adds checklists, attachments, activity log, dependencies, custom fields, mentions, priority

-- ============================================================
-- Priority column on cards
-- ============================================================
CREATE TYPE card_priority AS ENUM ('urgent', 'high', 'medium', 'low', 'none');

ALTER TABLE cards ADD COLUMN priority card_priority NOT NULL DEFAULT 'none';

-- ============================================================
-- Checklists
-- ============================================================
CREATE TABLE checklists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Checklist',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE checklist_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Attachments
-- ============================================================
CREATE TABLE attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Activity Log
-- ============================================================
CREATE TABLE activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Card Dependencies
-- ============================================================
CREATE TYPE dependency_type AS ENUM ('blocked_by', 'blocking', 'related');

CREATE TABLE card_dependencies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  target_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  dependency_type dependency_type NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_card_id, target_card_id, dependency_type)
);

-- ============================================================
-- Custom Field Definitions & Values
-- ============================================================
CREATE TYPE custom_field_type AS ENUM ('text', 'number', 'dropdown', 'date', 'checkbox', 'url');

CREATE TABLE custom_field_definitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_type custom_field_type NOT NULL,
  options JSONB DEFAULT '[]',
  is_required BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE custom_field_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(card_id, field_definition_id)
);

-- ============================================================
-- Mentions
-- ============================================================
CREATE TABLE mentions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_checklists_card_id ON checklists(card_id);
CREATE INDEX idx_checklist_items_checklist_id ON checklist_items(checklist_id);
CREATE INDEX idx_attachments_card_id ON attachments(card_id);
CREATE INDEX idx_activity_log_card_id ON activity_log(card_id);
CREATE INDEX idx_activity_log_board_id ON activity_log(board_id);
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_card_dependencies_source ON card_dependencies(source_card_id);
CREATE INDEX idx_card_dependencies_target ON card_dependencies(target_card_id);
CREATE INDEX idx_custom_field_definitions_board_id ON custom_field_definitions(board_id);
CREATE INDEX idx_custom_field_values_card_id ON custom_field_values(card_id);
CREATE INDEX idx_custom_field_values_field_id ON custom_field_values(field_definition_id);
CREATE INDEX idx_mentions_comment_id ON mentions(comment_id);
CREATE INDEX idx_mentions_user_id ON mentions(user_id);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write all (will be tightened in P1.2 RBAC)
CREATE POLICY "Authenticated users can read checklists" ON checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert checklists" ON checklists FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update checklists" ON checklists FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete checklists" ON checklists FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read checklist_items" ON checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert checklist_items" ON checklist_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update checklist_items" ON checklist_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete checklist_items" ON checklist_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read attachments" ON attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert attachments" ON attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete attachments" ON attachments FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read activity_log" ON activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert activity_log" ON activity_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read card_dependencies" ON card_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert card_dependencies" ON card_dependencies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete card_dependencies" ON card_dependencies FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read custom_field_definitions" ON custom_field_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert custom_field_definitions" ON custom_field_definitions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_field_definitions" ON custom_field_definitions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete custom_field_definitions" ON custom_field_definitions FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read custom_field_values" ON custom_field_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert custom_field_values" ON custom_field_values FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_field_values" ON custom_field_values FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete custom_field_values" ON custom_field_values FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read mentions" ON mentions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert mentions" ON mentions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete mentions" ON mentions FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE checklists;
ALTER PUBLICATION supabase_realtime ADD TABLE checklist_items;
ALTER PUBLICATION supabase_realtime ADD TABLE attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;

-- ============================================================
-- Trigger: auto-update custom_field_values.updated_at
-- ============================================================
CREATE TRIGGER update_custom_field_values_updated_at
  BEFORE UPDATE ON custom_field_values
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Storage bucket for card attachments
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-attachments', 'card-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'card-attachments');

CREATE POLICY "Anyone can view attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'card-attachments');

CREATE POLICY "Authenticated users can delete attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'card-attachments');
