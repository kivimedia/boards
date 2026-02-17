-- Migration 018: AM Client Update Emails (P2.9)
-- Automated email drafting, scheduling, and Google Calendar integration

-- ============================================================================
-- EMAIL CONFIG ON CLIENTS
-- ============================================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_config JSONB NOT NULL DEFAULT '{}';
-- email_config: { "update_cadence": "weekly"|"biweekly"|"monthly", "send_day": "monday", "send_time": "09:00", "tone": "formal"|"friendly"|"casual", "recipients": ["email@..."], "cc": [], "template_id": null }

-- ============================================================================
-- CLIENT EMAILS
-- ============================================================================
CREATE TABLE client_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'friendly' CHECK (tone IN ('formal', 'friendly', 'casual')),
  recipients TEXT[] NOT NULL DEFAULT '{}',
  cc TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'failed')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  resend_message_id TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  model_used TEXT,
  drafted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_emails_client ON client_emails(client_id);
CREATE INDEX idx_client_emails_status ON client_emails(status);
CREATE INDEX idx_client_emails_scheduled ON client_emails(scheduled_for);

-- ============================================================================
-- GOOGLE CALENDAR TOKENS
-- ============================================================================
CREATE TABLE google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  calendar_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE client_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_emails_select" ON client_emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_emails_insert" ON client_emails FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_emails_update" ON client_emails FOR UPDATE TO authenticated USING (true);
CREATE POLICY "client_emails_delete" ON client_emails FOR DELETE TO authenticated USING (true);

CREATE POLICY "gcal_tokens_select" ON google_calendar_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "gcal_tokens_insert" ON google_calendar_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "gcal_tokens_update" ON google_calendar_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "gcal_tokens_delete" ON google_calendar_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_client_emails_updated_at
  BEFORE UPDATE ON client_emails FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_gcal_tokens_updated_at
  BEFORE UPDATE ON google_calendar_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at();
