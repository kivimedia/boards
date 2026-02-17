-- Migration 009: Backup & Disaster Recovery (P1.8)
-- Backup jobs tracking for full and incremental backups

-- ============================================================================
-- BACKUPS
-- ============================================================================
CREATE TABLE backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'full',
  status TEXT NOT NULL DEFAULT 'pending',
  storage_path TEXT,
  size_bytes BIGINT DEFAULT 0,
  manifest JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- type values: 'full', 'incremental'
-- status values: 'pending', 'running', 'completed', 'failed'
-- manifest: { tables: { boards: 10, cards: 200, ... }, storage_files: 50, checksum: "sha256:..." }

CREATE INDEX idx_backups_status ON backups(status);
CREATE INDEX idx_backups_type ON backups(type);
CREATE INDEX idx_backups_created_at ON backups(created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backups_select" ON backups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "backups_insert" ON backups
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "backups_update" ON backups
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "backups_delete" ON backups
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_backups_updated_at
  BEFORE UPDATE ON backups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
