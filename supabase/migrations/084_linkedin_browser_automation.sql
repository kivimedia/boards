-- 084: LinkedIn Browser Automation
-- Adds browser session management and action logging for automated LinkedIn outreach

-- ============================================================================
-- li_browser_sessions: Stores persistent LinkedIn browser session data
-- ============================================================================
CREATE TABLE IF NOT EXISTS li_browser_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  session_name TEXT NOT NULL DEFAULT 'default',
  linkedin_email TEXT,
  status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active', 'inactive', 'expired', 'blocked', 'cooldown')),
  cookies_encrypted TEXT,
  user_data_dir TEXT,
  last_health_check_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  health_status TEXT DEFAULT 'unknown'
    CHECK (health_status IN ('healthy', 'degraded', 'logged_out', 'blocked', 'unknown')),
  daily_actions_count INT DEFAULT 0,
  daily_actions_reset_at DATE DEFAULT CURRENT_DATE,
  error_count INT DEFAULT 0,
  last_error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, session_name)
);

-- ============================================================================
-- li_browser_actions: Audit log of every browser action
-- ============================================================================
CREATE TABLE IF NOT EXISTS li_browser_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES li_browser_sessions(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lead_id UUID REFERENCES li_leads(id),
  message_id UUID REFERENCES li_outreach_messages(id),
  batch_id UUID REFERENCES li_daily_batches(id),
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'connect_with_note', 'send_message', 'check_inbox',
      'check_connections', 'view_profile', 'session_health_check',
      'withdraw_connection'
    )),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
  input_data JSONB DEFAULT '{}',
  result_data JSONB DEFAULT '{}',
  error_message TEXT,
  duration_ms INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_li_browser_sessions_user ON li_browser_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_li_browser_actions_session ON li_browser_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_li_browser_actions_lead ON li_browser_actions(lead_id);
CREATE INDEX IF NOT EXISTS idx_li_browser_actions_batch ON li_browser_actions(batch_id);
CREATE INDEX IF NOT EXISTS idx_li_browser_actions_status ON li_browser_actions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_li_browser_actions_type ON li_browser_actions(action_type, created_at);

-- ============================================================================
-- Alter existing tables
-- ============================================================================
ALTER TABLE li_outreach_messages
  ADD COLUMN IF NOT EXISTS browser_action_id UUID REFERENCES li_browser_actions(id),
  ADD COLUMN IF NOT EXISTS send_error TEXT;

ALTER TABLE li_daily_batches
  ADD COLUMN IF NOT EXISTS send_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_result JSONB DEFAULT '{}';

ALTER TABLE li_settings
  ADD COLUMN IF NOT EXISTS browser_session_id UUID,
  ADD COLUMN IF NOT EXISTS auto_send_approved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_delay_between_actions_ms INT DEFAULT 45000,
  ADD COLUMN IF NOT EXISTS max_delay_between_actions_ms INT DEFAULT 120000,
  ADD COLUMN IF NOT EXISTS enable_response_detection BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS response_check_interval_hours INT DEFAULT 4;

-- ============================================================================
-- RLS policies
-- ============================================================================
ALTER TABLE li_browser_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE li_browser_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "li_browser_sessions_select" ON li_browser_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "li_browser_sessions_insert" ON li_browser_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "li_browser_sessions_update" ON li_browser_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "li_browser_sessions_delete" ON li_browser_sessions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "li_browser_actions_select" ON li_browser_actions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "li_browser_actions_insert" ON li_browser_actions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "li_browser_actions_update" ON li_browser_actions
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role bypass for VPS worker
CREATE POLICY "li_browser_sessions_service" ON li_browser_sessions
  FOR ALL USING (current_setting('role') = 'service_role');
CREATE POLICY "li_browser_actions_service" ON li_browser_actions
  FOR ALL USING (current_setting('role') = 'service_role');
