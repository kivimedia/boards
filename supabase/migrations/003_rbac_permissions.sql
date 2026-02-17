-- Migration 003: RBAC & Permissions
-- Adds user roles, board membership, column move rules, and rewrites RLS policies

-- ============================================================
-- User Role Enum
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'department_lead', 'member', 'guest', 'client', 'observer');

-- Add user_role column to profiles (migrate existing 'role' text to enum)
ALTER TABLE profiles ADD COLUMN user_role user_role NOT NULL DEFAULT 'member';

-- Migrate existing text role values to enum where possible
UPDATE profiles SET user_role = 'admin' WHERE role = 'admin';
UPDATE profiles SET user_role = 'member' WHERE role = 'member' OR role IS NULL;

-- ============================================================
-- Board Members (explicit board-level access control)
-- ============================================================
CREATE TABLE board_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'member',
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(board_id, user_id)
);

-- ============================================================
-- Column Move Rules (restrict card movement between columns)
-- ============================================================
CREATE TABLE column_move_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  from_list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  to_list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  allowed_roles user_role[] NOT NULL DEFAULT '{admin,department_lead,member}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(board_id, from_list_id, to_list_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_board_members_board_id ON board_members(board_id);
CREATE INDEX idx_board_members_user_id ON board_members(user_id);
CREATE INDEX idx_column_move_rules_board_id ON column_move_rules(board_id);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_move_rules ENABLE ROW LEVEL SECURITY;

-- Board members: authenticated users can read, admins/leads can manage
CREATE POLICY "Authenticated users can read board_members"
  ON board_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert board_members"
  ON board_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update board_members"
  ON board_members FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete board_members"
  ON board_members FOR DELETE TO authenticated USING (true);

-- Column move rules: authenticated users can read, admins can manage
CREATE POLICY "Authenticated users can read column_move_rules"
  ON column_move_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert column_move_rules"
  ON column_move_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update column_move_rules"
  ON column_move_rules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete column_move_rules"
  ON column_move_rules FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Helper function: check if user is board member with given role
-- ============================================================
CREATE OR REPLACE FUNCTION is_board_member(p_board_id UUID, p_user_id UUID, p_roles user_role[] DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admins always have access
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND user_role = 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Board creator always has access
  IF EXISTS (SELECT 1 FROM boards WHERE id = p_board_id AND created_by = p_user_id) THEN
    RETURN TRUE;
  END IF;

  -- Check board membership
  IF p_roles IS NULL THEN
    RETURN EXISTS (SELECT 1 FROM board_members WHERE board_id = p_board_id AND user_id = p_user_id);
  ELSE
    RETURN EXISTS (SELECT 1 FROM board_members WHERE board_id = p_board_id AND user_id = p_user_id AND role = ANY(p_roles));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Auto-add board creator as admin member
-- ============================================================
CREATE OR REPLACE FUNCTION auto_add_board_creator()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO board_members (board_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'admin', NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_auto_add_board_creator
  AFTER INSERT ON boards
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_board_creator();

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE board_members;
