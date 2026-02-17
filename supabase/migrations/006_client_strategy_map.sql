-- Migration 006: Client Strategy Map Board (P1.5)
-- Clients, credentials vault, training tracker, doors/keys roadmap, map sections

-- ============================================================================
-- CLIENTS
-- ============================================================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  contacts JSONB NOT NULL DEFAULT '[]',
  client_tag TEXT,
  contract_type TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- contacts JSONB: [{ "name": "...", "email": "...", "phone": "...", "role": "..." }]

CREATE INDEX idx_clients_created_by ON clients(created_by);
CREATE INDEX idx_clients_client_tag ON clients(client_tag);

-- Add client_id to cards for cross-board client tagging
ALTER TABLE cards ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX idx_cards_client_id ON cards(client_id);

-- ============================================================================
-- CREDENTIALS VAULT (encrypted)
-- ============================================================================
CREATE TABLE credential_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  username_encrypted BYTEA,
  password_encrypted BYTEA,
  notes_encrypted BYTEA,
  category TEXT NOT NULL DEFAULT 'general',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credential_entries_client_id ON credential_entries(client_id);
CREATE INDEX idx_credential_entries_category ON credential_entries(category);

-- ============================================================================
-- CREDENTIAL AUDIT LOG
-- ============================================================================
CREATE TABLE credential_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES credential_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- action values: 'viewed', 'created', 'updated', 'deleted'

CREATE INDEX idx_credential_audit_log_credential_id ON credential_audit_log(credential_id);
CREATE INDEX idx_credential_audit_log_user_id ON credential_audit_log(user_id);

-- ============================================================================
-- TRAINING ASSIGNMENTS
-- ============================================================================
CREATE TABLE training_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  prompt TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submission TEXT,
  feedback TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status values: 'pending', 'in_progress', 'submitted', 'reviewed', 'completed'

CREATE INDEX idx_training_assignments_client_id ON training_assignments(client_id);
CREATE INDEX idx_training_assignments_assigned_to ON training_assignments(assigned_to);
CREATE INDEX idx_training_assignments_status ON training_assignments(status);

-- ============================================================================
-- DOORS (roadmap milestones)
-- ============================================================================
CREATE TABLE doors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  door_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'locked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status values: 'locked', 'in_progress', 'completed'

CREATE INDEX idx_doors_client_id ON doors(client_id);
CREATE UNIQUE INDEX idx_doors_client_number ON doors(client_id, door_number);

-- ============================================================================
-- DOOR KEYS (sub-tasks within a door)
-- ============================================================================
CREATE TABLE door_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  door_id UUID NOT NULL REFERENCES doors(id) ON DELETE CASCADE,
  key_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_door_keys_door_id ON door_keys(door_id);
CREATE UNIQUE INDEX idx_door_keys_door_number ON door_keys(door_id, key_number);

-- ============================================================================
-- MAP SECTIONS (flexible content sections for client strategy map)
-- ============================================================================
CREATE TABLE map_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content JSONB NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  is_client_visible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- section_type values: 'visual_brief', 'outreach_planner', 'resources', 'whiteboard', 'notes'

CREATE INDEX idx_map_sections_client_id ON map_sections(client_id);
CREATE INDEX idx_map_sections_section_type ON map_sections(section_type);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE doors ENABLE ROW LEVEL SECURITY;
ALTER TABLE door_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_sections ENABLE ROW LEVEL SECURITY;

-- Clients: all authenticated users can read and write
CREATE POLICY "clients_select" ON clients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_insert" ON clients
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clients_update" ON clients
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "clients_delete" ON clients
  FOR DELETE TO authenticated USING (true);

-- Credential entries: authenticated users only
CREATE POLICY "credential_entries_select" ON credential_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "credential_entries_insert" ON credential_entries
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "credential_entries_update" ON credential_entries
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "credential_entries_delete" ON credential_entries
  FOR DELETE TO authenticated USING (true);

-- Credential audit log: read-only for authenticated, insert by system
CREATE POLICY "credential_audit_log_select" ON credential_audit_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "credential_audit_log_insert" ON credential_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Training assignments
CREATE POLICY "training_assignments_select" ON training_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "training_assignments_insert" ON training_assignments
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "training_assignments_update" ON training_assignments
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "training_assignments_delete" ON training_assignments
  FOR DELETE TO authenticated USING (true);

-- Doors and keys
CREATE POLICY "doors_select" ON doors
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "doors_insert" ON doors
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "doors_update" ON doors
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "doors_delete" ON doors
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "door_keys_select" ON door_keys
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "door_keys_insert" ON door_keys
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "door_keys_update" ON door_keys
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "door_keys_delete" ON door_keys
  FOR DELETE TO authenticated USING (true);

-- Map sections
CREATE POLICY "map_sections_select" ON map_sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_sections_insert" ON map_sections
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "map_sections_update" ON map_sections
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "map_sections_delete" ON map_sections
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_credential_entries_updated_at
  BEFORE UPDATE ON credential_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_training_assignments_updated_at
  BEFORE UPDATE ON training_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_doors_updated_at
  BEFORE UPDATE ON doors FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_map_sections_updated_at
  BEFORE UPDATE ON map_sections FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE clients;
ALTER PUBLICATION supabase_realtime ADD TABLE training_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE doors;
ALTER PUBLICATION supabase_realtime ADD TABLE door_keys;
ALTER PUBLICATION supabase_realtime ADD TABLE map_sections;
