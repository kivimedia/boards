-- Migration 059: Cross-board mirror rules
-- Automatic card mirroring between Owner Dashboard and VA Workspace

CREATE TABLE IF NOT EXISTS mirror_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_board_id UUID REFERENCES boards ON DELETE CASCADE,
  source_list_name TEXT NOT NULL,
  target_board_id UUID REFERENCES boards ON DELETE CASCADE,
  target_list_name TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'one_way', -- one_way, bidirectional
  condition_field TEXT, -- optional: only mirror if this card field matches
  condition_value TEXT, -- optional: the value the field must have
  remove_from_source BOOLEAN DEFAULT false, -- if true, removes source placement after mirroring
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE mirror_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mirror_rules_select" ON mirror_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "mirror_rules_insert" ON mirror_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mirror_rules_update" ON mirror_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mirror_rules_delete" ON mirror_rules FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mirror_rules_source ON mirror_rules(source_board_id, source_list_name);
CREATE INDEX IF NOT EXISTS idx_mirror_rules_active ON mirror_rules(is_active) WHERE is_active = true;
