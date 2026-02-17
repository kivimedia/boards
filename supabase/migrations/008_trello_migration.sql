-- Migration 008: Trello Migration System (P1.7)
-- Migration jobs tracking and entity mapping for Trello imports

-- ============================================================================
-- MIGRATION JOBS
-- ============================================================================
CREATE TABLE migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'trello',
  status TEXT NOT NULL DEFAULT 'pending',
  config JSONB NOT NULL DEFAULT '{}',
  progress JSONB NOT NULL DEFAULT '{"current": 0, "total": 0, "phase": "initialized"}',
  report JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status values: 'pending', 'running', 'completed', 'failed', 'cancelled'
-- config: { trello_api_key, trello_token, board_ids: [], board_type_mapping: { trello_board_id: board_type }, user_mapping: { trello_member_id: user_id } }
-- progress: { current: 0, total: 100, phase: "importing_boards" | "importing_lists" | "importing_cards" | "importing_comments" | "importing_attachments" | "completed" }
-- report: { boards_created: 0, lists_created: 0, cards_created: 0, comments_created: 0, attachments_created: 0, labels_created: 0, errors: [] }

CREATE INDEX idx_migration_jobs_status ON migration_jobs(status);
CREATE INDEX idx_migration_jobs_started_by ON migration_jobs(started_by);

-- ============================================================================
-- MIGRATION ENTITY MAP (tracks source → target ID mapping for idempotency)
-- ============================================================================
CREATE TABLE migration_entity_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- source_type values: 'board', 'list', 'card', 'label', 'comment', 'attachment', 'member', 'checklist', 'checklist_item'

CREATE INDEX idx_migration_entity_map_job_id ON migration_entity_map(job_id);
CREATE INDEX idx_migration_entity_map_lookup ON migration_entity_map(job_id, source_type, source_id);
CREATE UNIQUE INDEX idx_migration_entity_map_unique ON migration_entity_map(job_id, source_type, source_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_entity_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "migration_jobs_select" ON migration_jobs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "migration_jobs_insert" ON migration_jobs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "migration_jobs_update" ON migration_jobs
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "migration_jobs_delete" ON migration_jobs
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "migration_entity_map_select" ON migration_entity_map
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "migration_entity_map_insert" ON migration_entity_map
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_migration_jobs_updated_at
  BEFORE UPDATE ON migration_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- REALTIME (for progress tracking)
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE migration_jobs;
