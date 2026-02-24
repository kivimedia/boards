-- Migration 057: Performance Keeping Module
-- Adds tables for tracking all Performance Keeping data from Google Sheets ecosystem
-- 19 sheets, ~103 tabs, 309 columns mapped

-- ============================================================
-- 1. Extend existing tables
-- ============================================================

-- Add website_url to clients (needed for sanity checks, pingdom, etc.)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS website_url TEXT;

-- AM-Client assignment junction table
CREATE TABLE IF NOT EXISTS am_client_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, client_id)
);

CREATE INDEX idx_am_client_assignments_profile ON am_client_assignments(profile_id);
CREATE INDEX idx_am_client_assignments_client ON am_client_assignments(client_id);

-- ============================================================
-- 2. Sync infrastructure
-- ============================================================

CREATE TABLE IF NOT EXISTS pk_sync_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id TEXT NOT NULL,
  sheet_title TEXT NOT NULL,
  tracker_type TEXT NOT NULL, -- fathom_videos, client_updates, etc.
  sync_frequency TEXT NOT NULL DEFAULT 'daily', -- hourly, daily, weekly, monthly
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT, -- success, error, partial
  last_sync_error TEXT,
  row_count INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}', -- extra config like tab filters, column mappings
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_sync_configs_tracker ON pk_sync_configs(tracker_type);
CREATE INDEX idx_pk_sync_configs_active ON pk_sync_configs(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS pk_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES pk_sync_configs(id) ON DELETE SET NULL,
  tracker_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', -- running, success, error, partial
  sheets_synced INTEGER DEFAULT 0,
  rows_synced INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  duration_ms INTEGER,
  triggered_by TEXT DEFAULT 'cron', -- cron, manual, webhook
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_pk_sync_runs_status ON pk_sync_runs(status);
CREATE INDEX idx_pk_sync_runs_started ON pk_sync_runs(started_at DESC);

-- ============================================================
-- 3. Tracker tables - Daily frequency
-- ============================================================

-- Fathom Video Tracker (Sheet 2) - per-AM, per-client video watch tracking
CREATE TABLE IF NOT EXISTS pk_fathom_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  account_manager_name TEXT NOT NULL, -- denormalized for display
  client_name TEXT,
  meeting_date DATE,
  date_watched DATE,
  fathom_video_link TEXT,
  watched BOOLEAN,
  action_items_sent BOOLEAN,
  attachments TEXT,
  notes TEXT,
  source_tab TEXT NOT NULL, -- which AM tab this came from
  source_row INTEGER, -- row number in sheet for dedup
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_fathom_videos_am ON pk_fathom_videos(account_manager_id);
CREATE INDEX idx_pk_fathom_videos_date ON pk_fathom_videos(meeting_date DESC);
CREATE INDEX idx_pk_fathom_videos_source ON pk_fathom_videos(source_tab, source_row);

-- Client Updates Tracker (Sheet 3) - per-AM, daily client update compliance
CREATE TABLE IF NOT EXISTS pk_client_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  account_manager_name TEXT NOT NULL,
  client_name TEXT,
  date_sent DATE,
  on_time BOOLEAN, -- UPDATE SENT ON TIME?
  method TEXT, -- Email, Whatsapp, etc.
  notes TEXT,
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_client_updates_am ON pk_client_updates(account_manager_id);
CREATE INDEX idx_pk_client_updates_date ON pk_client_updates(date_sent DESC);
CREATE INDEX idx_pk_client_updates_source ON pk_client_updates(source_tab, source_row);

-- Account Managers' Ticket Update Tracker (Sheet 9) - Spark/Lite compliance
CREATE TABLE IF NOT EXISTS pk_ticket_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_label TEXT NOT NULL, -- "FEB'26", "JAN'26", etc.
  client_type TEXT, -- SPARK CLIENTS or SPARK LITE CLIENTS
  client_name TEXT,
  updated BOOLEAN,
  report_timeframe TEXT, -- for Report tab
  report_attachment TEXT,
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_ticket_updates_month ON pk_ticket_updates(month_label);
CREATE INDEX idx_pk_ticket_updates_source ON pk_ticket_updates(source_tab, source_row);

-- ============================================================
-- 4. Tracker tables - Twice a week / Weekly frequency
-- ============================================================

-- Operations Team Daily Goals (Sheet 5) - designer/dev commitments
CREATE TABLE IF NOT EXISTS pk_daily_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE,
  designer_dev TEXT NOT NULL,
  commitment TEXT,
  link TEXT,
  updated BOOLEAN,
  completed BOOLEAN,
  percent NUMERIC(5,2),
  remarks TEXT,
  source_tab TEXT NOT NULL, -- FEB'26, 2026 Records, etc.
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_daily_goals_date ON pk_daily_goals(entry_date DESC);
CREATE INDEX idx_pk_daily_goals_person ON pk_daily_goals(designer_dev);
CREATE INDEX idx_pk_daily_goals_source ON pk_daily_goals(source_tab, source_row);

-- Sanity Checks (Sheet 4) - per-AM weekly website checks
CREATE TABLE IF NOT EXISTS pk_sanity_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  account_manager_name TEXT NOT NULL,
  check_date DATE,
  client_name TEXT,
  business_name TEXT,
  sanity_check_done BOOLEAN,
  notes TEXT,
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_sanity_checks_am ON pk_sanity_checks(account_manager_id);
CREATE INDEX idx_pk_sanity_checks_date ON pk_sanity_checks(check_date DESC);
CREATE INDEX idx_pk_sanity_checks_source ON pk_sanity_checks(source_tab, source_row);

-- Sanity Tests - detailed (Sheet 18 + 19, depth 2) - per-AM form/page testing
CREATE TABLE IF NOT EXISTS pk_sanity_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  account_manager_name TEXT NOT NULL,
  test_date DATE,
  client_name TEXT,
  website TEXT,
  form_link TEXT,
  test_done BOOLEAN,
  email_received BOOLEAN,
  device TEXT, -- Mobile/Desktop
  desktop_layout TEXT,
  mobile_layout TEXT,
  thank_you_page BOOLEAN,
  notes TEXT,
  documentation TEXT,
  source_sheet TEXT NOT NULL, -- KM - Sanity test or CAROLINE RAVN
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_sanity_tests_am ON pk_sanity_tests(account_manager_id);
CREATE INDEX idx_pk_sanity_tests_date ON pk_sanity_tests(test_date DESC);
CREATE INDEX idx_pk_sanity_tests_source ON pk_sanity_tests(source_sheet, source_tab, source_row);

-- PICS.IO Monitoring (Sheet 17) - weekly digital asset check-ins
CREATE TABLE IF NOT EXISTS pk_pics_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  account_manager_name TEXT NOT NULL,
  week_label TEXT, -- "Feb. 2-6, 2026"
  check_date DATE,
  client_name TEXT,
  duration TEXT, -- "30 mins"
  notes TEXT,
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_pics_monitoring_am ON pk_pics_monitoring(account_manager_id);
CREATE INDEX idx_pk_pics_monitoring_date ON pk_pics_monitoring(check_date DESC);
CREATE INDEX idx_pk_pics_monitoring_source ON pk_pics_monitoring(source_tab, source_row);

-- Flagged Tickets (Sheet 10) - red flag tracking for designers/devs/video
CREATE TABLE IF NOT EXISTS pk_flagged_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_type TEXT NOT NULL, -- Designers, Developers, Video Editor
  date_range TEXT,
  person_name TEXT NOT NULL,
  project_ticket_id TEXT,
  red_flag_type TEXT, -- NOTIFY column
  ticket_count INTEGER,
  reasonable BOOLEAN,
  description TEXT,
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_flagged_tickets_team ON pk_flagged_tickets(team_type);
CREATE INDEX idx_pk_flagged_tickets_person ON pk_flagged_tickets(person_name);
CREATE INDEX idx_pk_flagged_tickets_source ON pk_flagged_tickets(source_tab, source_row);

-- Weekly Ticket Tracker (Sheet 16) - dev/designer/video weekly counts
CREATE TABLE IF NOT EXISTS pk_weekly_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_type TEXT NOT NULL, -- DEVELOPERS, DESIGNERS, Video Editor
  week_date DATE,
  raw_content TEXT, -- these sheets are loosely structured
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_weekly_tickets_team ON pk_weekly_tickets(team_type);
CREATE INDEX idx_pk_weekly_tickets_source ON pk_weekly_tickets(source_tab, source_row);

-- ============================================================
-- 5. Tracker tables - Monthly / Quarterly / Reference
-- ============================================================

-- Pingdom Speed Tests (Sheet 6) - quarterly website speed results
CREATE TABLE IF NOT EXISTS pk_pingdom_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  account_manager_name TEXT,
  test_date DATE,
  client_name TEXT,
  client_website TEXT,
  report_attachment TEXT,
  notes TEXT,
  quarter_label TEXT, -- "2026 | QUARTER 1"
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_pingdom_tests_date ON pk_pingdom_tests(test_date DESC);
CREATE INDEX idx_pk_pingdom_tests_source ON pk_pingdom_tests(source_tab, source_row);

-- Google Ads Monthly Report (Sheet 7) - monthly report tracking
CREATE TABLE IF NOT EXISTS pk_google_ads_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_label TEXT NOT NULL, -- "JAN'26", "DEC'25", etc.
  raw_content TEXT, -- these are loosely structured monthly reports
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_google_ads_reports_month ON pk_google_ads_reports(month_label);
CREATE INDEX idx_pk_google_ads_reports_source ON pk_google_ads_reports(source_tab, source_row);

-- Monthly Summary (Sheet 11) - monthly performance reports
CREATE TABLE IF NOT EXISTS pk_monthly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_label TEXT NOT NULL,
  attachment TEXT,
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pk_monthly_summaries_month ON pk_monthly_summaries(month_label);

-- Update Schedule (Sheet 8) - client preferred meeting/update times
CREATE TABLE IF NOT EXISTS pk_update_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_name TEXT,
  client_name TEXT,
  preferred_time TEXT,
  notes TEXT,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Holiday Section Tracking (Sheet 13) - seasonal holiday page updates
CREATE TABLE IF NOT EXISTS pk_holiday_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_name TEXT NOT NULL,
  website_link TEXT,
  raw_content TEXT,
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AM Clients Websites Status (Sheet 14) - client website launch status
CREATE TABLE IF NOT EXISTS pk_website_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_name TEXT,
  client_name TEXT,
  business_name TEXT,
  website_link TEXT,
  status TEXT, -- LAUNCHED, LAUNCHED BUT STILL BUILDING, etc.
  notes TEXT,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Google Analytics Clients (Sheet 15) - GA setup checklist
CREATE TABLE IF NOT EXISTS pk_google_analytics_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase TEXT, -- Phase 1 / Phase 2
  status TEXT, -- YES, CHECKED & CONFIRMED, etc.
  raw_content TEXT,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- KM's Other Activities (Sheet 12) - reference/training content
CREATE TABLE IF NOT EXISTS pk_other_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_type TEXT NOT NULL, -- Automator, Core Values, ChatGPT Agent Mode, GHL Quiz
  content TEXT,
  source_tab TEXT NOT NULL,
  source_row INTEGER,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. RLS Policies
-- ============================================================

ALTER TABLE am_client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_sync_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_fathom_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_client_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_ticket_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_daily_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_sanity_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_sanity_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_pics_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_flagged_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_weekly_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_pingdom_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_google_ads_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_monthly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_update_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_holiday_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_website_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_google_analytics_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_other_activities ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all PK data
CREATE POLICY "Authenticated users can read am_client_assignments" ON am_client_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage am_client_assignments" ON am_client_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_sync_configs" ON pk_sync_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_sync_configs" ON pk_sync_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_sync_runs" ON pk_sync_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_sync_runs" ON pk_sync_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_fathom_videos" ON pk_fathom_videos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_fathom_videos" ON pk_fathom_videos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_client_updates" ON pk_client_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_client_updates" ON pk_client_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_ticket_updates" ON pk_ticket_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_ticket_updates" ON pk_ticket_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_daily_goals" ON pk_daily_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_daily_goals" ON pk_daily_goals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_sanity_checks" ON pk_sanity_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_sanity_checks" ON pk_sanity_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_sanity_tests" ON pk_sanity_tests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_sanity_tests" ON pk_sanity_tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_pics_monitoring" ON pk_pics_monitoring FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_pics_monitoring" ON pk_pics_monitoring FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_flagged_tickets" ON pk_flagged_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_flagged_tickets" ON pk_flagged_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_weekly_tickets" ON pk_weekly_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_weekly_tickets" ON pk_weekly_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_pingdom_tests" ON pk_pingdom_tests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_pingdom_tests" ON pk_pingdom_tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_google_ads_reports" ON pk_google_ads_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_google_ads_reports" ON pk_google_ads_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_monthly_summaries" ON pk_monthly_summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_monthly_summaries" ON pk_monthly_summaries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_update_schedule" ON pk_update_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_update_schedule" ON pk_update_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_holiday_tracking" ON pk_holiday_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_holiday_tracking" ON pk_holiday_tracking FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_website_status" ON pk_website_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_website_status" ON pk_website_status FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_google_analytics_status" ON pk_google_analytics_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_google_analytics_status" ON pk_google_analytics_status FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pk_other_activities" ON pk_other_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage pk_other_activities" ON pk_other_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 7. Realtime publication
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE pk_flagged_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE pk_sync_runs;

-- ============================================================
-- 8. Seed sync configs for all 19 sheets
-- ============================================================

INSERT INTO pk_sync_configs (spreadsheet_id, sheet_title, tracker_type, sync_frequency) VALUES
  ('1XPr4nraaXWOv4ubZCwyPLSvbr2LvawU0HT2AvPj8Bjk', 'KM & DC | MASTERLIST OF TRACKERS', 'masterlist', 'daily'),
  ('1m1_oQGk3RYd7s9ETTsoCRTvfZPLs-NsiOKCVIiN8BPA', 'KM Fathom Video Tracker', 'fathom_videos', 'daily'),
  ('1xSLGI3yJiedq9B7yihz37XZHrnPkouyhaH8FqBe7ROI', 'KM Client Updates Tracker', 'client_updates', 'daily'),
  ('169j-0iUPBRUKDfhHfS_yvoGhKPhXdI31kfKDjLCJIRM', 'KM Sanity Checks', 'sanity_checks', 'weekly'),
  ('1hx0oJJ9ulISBj1vlBX8-rQEIqlaERgyh4lg7-mx_B-0', 'Operations Team Daily GoalsTracker', 'daily_goals', 'daily'),
  ('1zBWgluXaDAT8HvmXToH2-juAImd4geVZv2GWFi96HDE', 'QUARTERLY - Pingdom Speed Test', 'pingdom_tests', 'weekly'),
  ('12tO954LRVsT5edcOl4NohdWIU0akZvqTEi4nPHmgBes', 'Google Ads Monthly Report Tracker', 'google_ads_reports', 'weekly'),
  ('1ciRMFrWF8oaRRvc9mIn3wYv9Txchp3YM5cI6MPifXY4', 'Update Schedule', 'update_schedule', 'weekly'),
  ('1Os4IP5t615n5aVkhfYHTD6aCqfcyjGvlfWrTklc_DzQ', 'Account Managers Ticket Update Tracker', 'ticket_updates', 'daily'),
  ('1jPaHhwX7yg3-rxifIc6v_9QUSvTL3R4G58ydyL22m6Y', 'Developers & Designers Flagged Tickets Tracker', 'flagged_tickets', 'weekly'),
  ('1EitQNxT7LngeNZs9xle2ArXdZNuq2yFB30w4J_cCoJM', 'MONTHLY SUMMARY', 'monthly_summaries', 'monthly'),
  ('1NksA1Vvu8i-9rw39Qb3hrcAIzSKgnXmdZ4biBQSy6uc', 'KMs Other Activities', 'other_activities', 'monthly'),
  ('1XrVMobNH1kshDWfZQ6misIusohRupsbqj1e3bMR0BTc', 'Holiday Section Tracking Sheet', 'holiday_tracking', 'monthly'),
  ('1wst1K_5ZvU7v2TH3a0QXwQ4pz5FJdx7YmPWFGEEuENM', 'AM_Clients_Websites_Status', 'website_status', 'weekly'),
  ('19IE69cx5PVdbVV3x6yKfyiH2Hrjv6JENEMAwlHlKy9E', 'KM ACTIVE CLIENTS - Google Analytics', 'google_analytics_status', 'monthly'),
  ('1a46z55vnify6R8M7JyH6urFhhgw-IeegThXDMUjT7e8', 'Operations Team Weekly Ticket Tracker', 'weekly_tickets', 'weekly'),
  ('1x_g6eQApzJQeQlRusVx_w6g3nEKZk1Xqj9dcyjjsy8o', 'PICS.IO Monitoring Sheet_1hr/week', 'pics_monitoring', 'weekly'),
  ('1BZvQN_mwc_mqedHLzzl3CzhqWhZ6CfYcUFUsKv9HNko', 'KM - Sanity test', 'sanity_tests', 'weekly'),
  ('1SxVih46lozJjhho_Uho3HWPlzhqIBAcA1j8woNcyR1Y', 'SANITY CHECKS | CAROLINE RAVN', 'sanity_tests', 'weekly');

-- ============================================================
-- 9. Updated_at trigger
-- ============================================================

CREATE TRIGGER set_pk_sync_configs_updated_at
  BEFORE UPDATE ON pk_sync_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
