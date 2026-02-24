-- ============================================================================
-- 062_client_weekly_gantt.sql
-- Client-facing weekly Gantt board: plans, tasks, snapshots, email logs.
-- Supports copy-from-last-week, reminders, history control.
-- ============================================================================

-- ============================================================================
-- 1. WEEKLY PLANS (one per client per week)
-- ============================================================================
CREATE TABLE client_weekly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_from UUID REFERENCES client_weekly_plans(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One plan per client per week
CREATE UNIQUE INDEX idx_cwp_client_week ON client_weekly_plans (client_id, week_start);
CREATE INDEX idx_cwp_client ON client_weekly_plans (client_id, week_start DESC);
CREATE INDEX idx_cwp_status ON client_weekly_plans (status) WHERE status = 'active';

-- ============================================================================
-- 2. WEEKLY TASKS (tasks within a plan, spanning day ranges Mon–Sun)
-- ============================================================================
CREATE TABLE client_weekly_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES client_weekly_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  day_start SMALLINT NOT NULL DEFAULT 1
    CHECK (day_start >= 1 AND day_start <= 7),
  day_end SMALLINT NOT NULL DEFAULT 1
    CHECK (day_end >= 1 AND day_end <= 7),
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  reminder_at TIMESTAMPTZ,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT day_range_valid CHECK (day_end >= day_start)
);

CREATE INDEX idx_cwt_plan ON client_weekly_tasks (plan_id, sort_order);
CREATE INDEX idx_cwt_owner ON client_weekly_tasks (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_cwt_reminder ON client_weekly_tasks (reminder_at)
  WHERE reminder_at IS NOT NULL AND reminder_sent = false AND completed = false;

-- ============================================================================
-- 3. PLAN SNAPSHOTS (frozen history for version control)
-- ============================================================================
CREATE TABLE weekly_plan_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES client_weekly_plans(id) ON DELETE CASCADE,
  snapshot_data JSONB NOT NULL,
  snapshot_reason TEXT NOT NULL DEFAULT 'manual'
    CHECK (snapshot_reason IN ('manual', 'auto_weekly', 'before_copy', 'before_email')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wps_plan ON weekly_plan_snapshots (plan_id, created_at DESC);

-- ============================================================================
-- 4. EMAIL LOG (track sent weekly digests)
-- ============================================================================
CREATE TABLE weekly_plan_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES client_weekly_plans(id) ON DELETE CASCADE,
  sent_to TEXT[] NOT NULL,
  subject TEXT NOT NULL,
  resend_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wpel_plan ON weekly_plan_email_log (plan_id, created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE client_weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_weekly_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plan_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plan_email_log ENABLE ROW LEVEL SECURITY;

-- client_weekly_plans
CREATE POLICY "cwp_select" ON client_weekly_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "cwp_insert" ON client_weekly_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cwp_update" ON client_weekly_plans FOR UPDATE TO authenticated USING (true);
CREATE POLICY "cwp_delete" ON client_weekly_plans FOR DELETE TO authenticated USING (true);

-- client_weekly_tasks
CREATE POLICY "cwt_select" ON client_weekly_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "cwt_insert" ON client_weekly_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cwt_update" ON client_weekly_tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "cwt_delete" ON client_weekly_tasks FOR DELETE TO authenticated USING (true);

-- weekly_plan_snapshots
CREATE POLICY "wps_select" ON weekly_plan_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "wps_insert" ON weekly_plan_snapshots FOR INSERT TO authenticated WITH CHECK (true);

-- weekly_plan_email_log
CREATE POLICY "wpel_select" ON weekly_plan_email_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "wpel_insert" ON weekly_plan_email_log FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_cwp_updated_at
  BEFORE UPDATE ON client_weekly_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_cwt_updated_at
  BEFORE UPDATE ON client_weekly_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
