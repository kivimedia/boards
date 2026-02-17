-- Migration 014: Client Boards & Portal (P2.4)
-- Client-facing boards, magic-link auth, ticket routing, approval workflow

-- ============================================================================
-- CLIENT BOARDS
-- ============================================================================
CREATE TABLE client_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, board_id)
);

CREATE INDEX idx_client_boards_client ON client_boards(client_id);
CREATE INDEX idx_client_boards_board ON client_boards(board_id);

-- ============================================================================
-- EXTEND CARDS TABLE FOR CLIENT VISIBILITY
-- ============================================================================
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_client_visible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS client_status TEXT CHECK (client_status IN ('in_progress', 'ready_for_review', 'approved', 'delivered', 'revision_requested'));
ALTER TABLE cards ADD COLUMN IF NOT EXISTS client_ticket_type TEXT CHECK (client_ticket_type IN ('design', 'bug', 'dev', 'content', 'video', 'general'));
ALTER TABLE cards ADD COLUMN IF NOT EXISTS approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected', 'revision_requested'));

-- ============================================================================
-- EXTEND COMMENTS FOR EXTERNAL/CLIENT VISIBILITY
-- ============================================================================
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- CLIENT PORTAL USERS (linked to auth.users via magic link)
-- ============================================================================
CREATE TABLE client_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  is_primary_contact BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_portal_users_client ON client_portal_users(client_id);
CREATE INDEX idx_client_portal_users_email ON client_portal_users(email);
CREATE INDEX idx_client_portal_users_user ON client_portal_users(user_id);

-- ============================================================================
-- CLIENT TICKETS (for routing requests to department boards)
-- ============================================================================
CREATE TABLE client_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES client_portal_users(id) ON DELETE SET NULL,
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('design', 'bug', 'dev', 'content', 'video', 'general')),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'routed', 'in_progress', 'completed', 'closed')),
  routed_to_card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  routed_to_board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_tickets_client ON client_tickets(client_id);
CREATE INDEX idx_client_tickets_status ON client_tickets(status);
CREATE INDEX idx_client_tickets_type ON client_tickets(ticket_type);

-- ============================================================================
-- SATISFACTION RESPONSES
-- ============================================================================
CREATE TABLE satisfaction_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  submitted_by UUID REFERENCES client_portal_users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_satisfaction_responses_client ON satisfaction_responses(client_id);
CREATE INDEX idx_satisfaction_responses_card ON satisfaction_responses(card_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE client_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE satisfaction_responses ENABLE ROW LEVEL SECURITY;

-- Internal users can manage client boards
CREATE POLICY "client_boards_select" ON client_boards
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_boards_insert" ON client_boards
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_boards_update" ON client_boards
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "client_boards_delete" ON client_boards
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "client_portal_users_select" ON client_portal_users
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_portal_users_insert" ON client_portal_users
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_portal_users_update" ON client_portal_users
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "client_portal_users_delete" ON client_portal_users
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "client_tickets_select" ON client_tickets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_tickets_insert" ON client_tickets
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_tickets_update" ON client_tickets
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "client_tickets_delete" ON client_tickets
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "satisfaction_responses_select" ON satisfaction_responses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "satisfaction_responses_insert" ON satisfaction_responses
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_client_boards_updated_at
  BEFORE UPDATE ON client_boards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_client_portal_users_updated_at
  BEFORE UPDATE ON client_portal_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_client_tickets_updated_at
  BEFORE UPDATE ON client_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
