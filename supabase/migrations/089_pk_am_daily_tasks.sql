-- Migration 089: Account Manager Daily Tasks (Performance reminder source)

CREATE TABLE IF NOT EXISTS pk_am_daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_date DATE NOT NULL,
  account_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  account_manager_name TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('fathom_watch', 'action_items_send', 'client_update')),
  task_label TEXT NOT NULL,
  notes TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pk_am_daily_tasks_date_am
  ON pk_am_daily_tasks(task_date DESC, account_manager_name);

CREATE INDEX IF NOT EXISTS idx_pk_am_daily_tasks_pending
  ON pk_am_daily_tasks(task_date DESC, is_completed);

CREATE INDEX IF NOT EXISTS idx_pk_am_daily_tasks_type
  ON pk_am_daily_tasks(task_type);

CREATE INDEX IF NOT EXISTS idx_pk_am_daily_tasks_am_id
  ON pk_am_daily_tasks(account_manager_id);

ALTER TABLE pk_am_daily_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pk_am_daily_tasks"
  ON pk_am_daily_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage pk_am_daily_tasks"
  ON pk_am_daily_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_pk_am_daily_tasks_updated_at ON pk_am_daily_tasks;
CREATE TRIGGER set_pk_am_daily_tasks_updated_at
  BEFORE UPDATE ON pk_am_daily_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
