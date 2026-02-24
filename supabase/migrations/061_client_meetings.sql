-- ============================================================================
-- 061_client_meetings.sql
-- Google Calendar integration, per-client meeting config, weekly updates,
-- meeting prep sessions with live AI chat
-- ============================================================================

-- ============================================================================
-- 1. GOOGLE CALENDAR CONNECTION (singleton - one active connection)
-- ============================================================================
CREATE TABLE google_calendar_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active connection at a time
CREATE UNIQUE INDEX idx_gcal_active ON google_calendar_connection (is_active)
  WHERE is_active = true;

CREATE INDEX idx_gcal_user ON google_calendar_connection (user_id);

-- ============================================================================
-- 2. CACHED CALENDAR EVENTS (populated by daily cron)
-- ============================================================================
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_event_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  attendees JSONB DEFAULT '[]',
  recurrence_rule TEXT,
  recurring_event_id TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  event_link TEXT,
  raw_data JSONB DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_events_start ON calendar_events (start_time);
CREATE INDEX idx_calendar_events_title ON calendar_events USING gin (to_tsvector('english', title));
CREATE INDEX idx_calendar_events_recurring ON calendar_events (recurring_event_id)
  WHERE recurring_event_id IS NOT NULL;

-- ============================================================================
-- 3. CLIENT MEETING CONFIG (per-client, one per client)
-- ============================================================================
CREATE TABLE client_meeting_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  calendar_event_keyword TEXT NOT NULL,
  calendar_event_id TEXT,
  update_timing TEXT NOT NULL DEFAULT '1_hour_before'
    CHECK (update_timing IN ('1_hour_before', '1_day_before')),
  send_mode TEXT NOT NULL DEFAULT 'approve'
    CHECK (send_mode IN ('auto_send', 'approve')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  send_to_contacts JSONB DEFAULT '[]',
  last_matched_event_time TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_cmc_client ON client_meeting_configs (client_id);
CREATE INDEX idx_cmc_active ON client_meeting_configs (is_active) WHERE is_active = true;

-- ============================================================================
-- 4. WEEKLY CLIENT UPDATES (generated update records)
-- ============================================================================
CREATE TABLE client_weekly_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES client_meeting_configs(id) ON DELETE CASCADE,
  meeting_event_id TEXT,
  meeting_time TIMESTAMPTZ,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Content
  raw_activity JSONB NOT NULL DEFAULT '[]',
  ai_summary TEXT,
  ai_detailed_html TEXT,
  ai_model_used TEXT,
  ai_tokens_used INTEGER DEFAULT 0,

  -- Send state
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'scheduled', 'sent', 'failed', 'cancelled')),
  scheduled_send_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  resend_message_ids JSONB DEFAULT '[]',
  sent_to_emails JSONB DEFAULT '[]',

  -- Error handling
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cwu_client ON client_weekly_updates (client_id, created_at DESC);
CREATE INDEX idx_cwu_status ON client_weekly_updates (status)
  WHERE status IN ('pending_approval', 'scheduled');
CREATE INDEX idx_cwu_scheduled ON client_weekly_updates (scheduled_send_at)
  WHERE status = 'scheduled' AND scheduled_send_at IS NOT NULL;

-- ============================================================================
-- 5. MEETING PREP SESSIONS (per-meeting prep + live chat)
-- ============================================================================
CREATE TABLE meeting_prep_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  calendar_event_id TEXT,
  meeting_time TIMESTAMPTZ NOT NULL,
  meeting_title TEXT,

  -- Prep content (pre-computed for instant display)
  executive_summary TEXT,
  tickets_snapshot JSONB DEFAULT '[]',
  last_update_id UUID REFERENCES client_weekly_updates(id) ON DELETE SET NULL,

  -- Session state
  prep_shown_at TIMESTAMPTZ,
  meeting_started_at TIMESTAMPTZ,
  meeting_ended_at TIMESTAMPTZ,

  -- AI chat messages stored inline
  chat_messages JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mps_client ON meeting_prep_sessions (client_id, meeting_time DESC);
CREATE INDEX idx_mps_upcoming ON meeting_prep_sessions (meeting_time)
  WHERE meeting_ended_at IS NULL;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE google_calendar_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_meeting_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_weekly_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_prep_sessions ENABLE ROW LEVEL SECURITY;

-- google_calendar_connection
CREATE POLICY "gcal_conn_select" ON google_calendar_connection FOR SELECT TO authenticated USING (true);
CREATE POLICY "gcal_conn_insert" ON google_calendar_connection FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gcal_conn_update" ON google_calendar_connection FOR UPDATE TO authenticated USING (true);
CREATE POLICY "gcal_conn_delete" ON google_calendar_connection FOR DELETE TO authenticated USING (true);

-- calendar_events
CREATE POLICY "cal_events_select" ON calendar_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "cal_events_insert" ON calendar_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cal_events_update" ON calendar_events FOR UPDATE TO authenticated USING (true);
CREATE POLICY "cal_events_delete" ON calendar_events FOR DELETE TO authenticated USING (true);

-- client_meeting_configs
CREATE POLICY "cmc_select" ON client_meeting_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "cmc_insert" ON client_meeting_configs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cmc_update" ON client_meeting_configs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "cmc_delete" ON client_meeting_configs FOR DELETE TO authenticated USING (true);

-- client_weekly_updates
CREATE POLICY "cwu_select" ON client_weekly_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "cwu_insert" ON client_weekly_updates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cwu_update" ON client_weekly_updates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "cwu_delete" ON client_weekly_updates FOR DELETE TO authenticated USING (true);

-- meeting_prep_sessions
CREATE POLICY "mps_select" ON meeting_prep_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "mps_insert" ON meeting_prep_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mps_update" ON meeting_prep_sessions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "mps_delete" ON meeting_prep_sessions FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_gcal_conn_updated_at
  BEFORE UPDATE ON google_calendar_connection FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_cal_events_updated_at
  BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_cmc_updated_at
  BEFORE UPDATE ON client_meeting_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_cwu_updated_at
  BEFORE UPDATE ON client_weekly_updates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_mps_updated_at
  BEFORE UPDATE ON meeting_prep_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
